// Iframe app entry (widget.html). Nhận session (jwt/config) TỪ loader qua postMessage (loader mới có
// đúng Origin website khách để handshake — xem loader.ts). Ở đây: pre-chat form → khung chat (history,
// optimistic send, SSE, typing), refresh JWT khi hết hạn, đếm unread báo loader.
import { WIDGET_CHANNEL, type IframeToLoader, type LoaderToIframe } from '../shared/protocol';
import { applySession, markPreChatDone, preChatDone, state } from './store';
import { fetchMessages, sendMessage, sendTyping, triggerCampaign } from './api';
import { SseManager } from './sse';
import { WidgetUI } from './ui';
import { CampaignMatcher } from './campaigns';
import { pickLocale, t, type Locale } from '../shared/strings';
import type { CampaignPreview } from '../shared/types';

const TYPING_THROTTLE_MS = 2500;
const SNOOZE_MS = 60 * 60 * 1000; // AC5: bấm X → tắt campaign 1h

const params = new URLSearchParams(window.location.search);
state.siteKey = (params.get('site_key') || '').trim();
// Locale tạm thời trước khi có `session`: iframe KHÔNG đọc được `<html lang>` của trang khách (khác
// origin) nên chỉ đoán theo navigator. Loader chốt locale thật và gửi kèm message `session` (v1.2.0);
// loader/BE cũ không gửi field đó ⇒ giữ nguyên phỏng đoán này.
applyLocale(pickLocale({ navigatorLang: navigator.language }));

const parentOrigin = referrerOrigin();
const appRoot = document.getElementById('app') || document.body;

let ui: WidgetUI;
let sse: SseManager | null = null;
// story B-05 (CRITICAL): iframe giờ mount ẨN ngay từ boot (loader eager-mount, xem loader.ts mount()) — KHÔNG
// còn đúng để mặc định "đang mở". Bắt đầu false; loader gửi 'opened' khi user thật sự mở (bubble/preview).
let isOpen = false;
let unread = 0;
let inChat = false;
let awaitingPreChat = false;
let lastTypingAt = 0;
const pendingResend: { echoId: string; text: string }[] = [];
// story-07 AC4: tin nhắn gõ sẵn trong pre-chat (field message) — gửi ngay khi enterChat(), TRƯỚC
// loadHistory(). Guard firstMessageSent chống gửi lặp nếu enterChat/onSessionReady chạy lại (re-handshake).
let pendingFirstMessage: string | null = null;
let firstMessageSent = false;

// story B-04: matching campaign chạy độc lập với luồng chat/handshake ở trên — nhận `campaigns`/`url_changed`
// từ loader bất kể pre-chat/session đã sẵn sàng chưa (campaign phải chạy TRƯỚC khi visitor mở chat).
const campaignMatcher = new CampaignMatcher(onCampaignDue);

// ── story B-05: compact-preview state ──
let activeCampaign: CampaignPreview | null = null; // campaign đang hiện compact-preview (chưa click)
let pendingRefetchCampaignId: number | null = null; // đợi loader refetch (AC3) trước khi hiện preview
let pendingTriggerCampaignId: number | null = null; // đã click preview, đợi handshake xong để POST trigger
// messageCount: số tin của phiên hiện tại (visitor gửi hoặc nhận từ staff). Chưa handshake ⇒ chắc chắn 0
// (chưa có conversation) — đủ an toàn cho guard AC1 (xem Dev Notes story B-05).
let messageCount = 0;

function snoozeKey(): string {
  return `cluvix_lc_snooze_${state.siteKey}`;
}
function inSnooze(): boolean {
  try {
    const till = Number(window.localStorage.getItem(snoozeKey()) || '0');
    return Number.isFinite(till) && Date.now() < till;
  } catch {
    return false;
  }
}
function setSnooze() {
  try {
    window.localStorage.setItem(snoozeKey(), String(Date.now() + SNOOZE_MS));
  } catch {
    /* private mode: bỏ qua — không snooze được thì tệ nhất hiện lại preview, không phá chat lõi */
  }
}

boot();

function applyLocale(loc: Locale) {
  state.locale = loc;
  document.documentElement.lang = loc; // widget.html để trống lang, set động theo locale đã chốt
}

function createUi(): WidgetUI {
  return new WidgetUI(appRoot, state.theme, {
    onSend: handleSend,
    onTyping: handleTyping,
    onClose: () => post({ channel: WIDGET_CHANNEL, type: 'close' }),
    onSubmitPreChat: handleSubmitPreChat,
    onRetry: (echoId, text) => resend(echoId, text),
  }, state.locale);
}

function boot() {
  ui = createUi();
  ui.showLoading();
  window.addEventListener('message', onLoaderMessage);
  // Escape trong iframe = đóng widget (trang cha cũng bắt Escape của chính nó — xem loader.ts).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') post({ channel: WIDGET_CHANNEL, type: 'close' });
  });
  // Báo loader iframe đã sẵn sàng nhận session.
  post({ channel: WIDGET_CHANNEL, type: 'ready' });
}

function onLoaderMessage(ev: MessageEvent) {
  if (ev.source !== window.parent) return; // chỉ nhận từ cửa sổ cha (loader)
  const msg = ev.data as LoaderToIframe;
  if (!msg || msg.channel !== WIDGET_CHANNEL) return;
  switch (msg.type) {
    case 'session': {
      // story-08 AC3: loader gọi setUser() ⇒ re-handshake ⇒ BE trả conversation_id KHÁC. Lịch sử/optimistic
      // của hội thoại cũ không còn đúng — dựng lại UI sạch rồi nạp lại history theo JWT mới.
      const prevConversationId = state.conversationId;
      // Locale phải chốt TRƯỚC applySession(): text mặc định của theme (greeting/offline) lấy theo locale.
      const nextLocale = msg.locale ?? msg.data.config?.widget_theme?.locale ?? state.locale;
      if (nextLocale !== state.locale) applyLocale(nextLocale);
      applySession(msg.data);
      ui.setLocale(state.locale);
      const switchedConversation = prevConversationId !== 0 && state.conversationId !== prevConversationId;
      if (switchedConversation) resetForNewConversation();
      ui.applyTheme(state.theme);
      ui.setIdentity(state.identityVerified ? state.displayName : ''); // story-07 AC7
      // story B-05 (AC4): nếu session này đến từ 1 lượt click compact-preview đang chờ trigger → bắn
      // POST trigger TRƯỚC khi vào chat (để tin campaign có mặt khi loadHistory() chạy trong enterChat()).
      if (pendingTriggerCampaignId != null) {
        const campaignId = pendingTriggerCampaignId;
        pendingTriggerCampaignId = null;
        void triggerCampaignThenContinue(campaignId);
      } else {
        onSessionReady();
      }
      if (switchedConversation) sse?.reconnectNow(); // SSE cũ đang bám conversation/JWT cũ
      break;
    }
    case 'session_error':
      ui.showOffline(msg.disabled ? state.theme.offline_text : t(state.locale).offlineGeneric);
      break;
    case 'opened':
      isOpen = true;
      unread = 0;
      post({ channel: WIDGET_CHANNEL, type: 'unread', count: 0 });
      if (inChat) ui.focusComposer(); // đang ở khung chat sẵn → mở lại thì con trỏ vào ngay ô soạn tin
      // Cạnh biên: user bấm BUBBLE (không phải click preview) trong lúc compact-preview đang hiện — huỷ
      // preview (không snooze, đây không phải hành động "đóng" campaign) + dọn UI khỏi màn preview dở dang
      // (session/onSessionReady sắp tới sẽ render lại đúng màn hình, nhưng cần tránh flash preview cũ).
      if (activeCampaign) {
        activeCampaign = null;
        ui.showLoading();
      }
      break;
    case 'closed':
      isOpen = false;
      break;
    case 'campaigns':
      campaignMatcher.setCampaigns(msg.list);
      maybeShowPendingPreview(msg.list);
      break;
    case 'url_changed':
      campaignMatcher.urlChanged(msg.url);
      break;
  }
}

// story B-04→B-05: campaign "đến hạn" (B-04 CampaignMatcher). AC1 guard: widget đang đóng + visitor CHƯA có
// tin nào trong phiên + KHÔNG trong snooze + chưa có preview khác đang hiện/đang chờ. Đạt guard → xin loader
// refetch list BỎ CACHE (AC3, double-check campaign còn `enabled` — admin có thể vừa tắt) rồi mới hiện.
function onCampaignDue(campaign: CampaignPreview) {
  if (!campaignGuardOk() || activeCampaign || pendingRefetchCampaignId != null) return;
  pendingRefetchCampaignId = campaign.id;
  post({ channel: WIDGET_CHANNEL, type: 'refetch_campaigns' });
}

function campaignGuardOk(): boolean {
  return !isOpen && messageCount === 0 && !inSnooze();
}

function maybeShowPendingPreview(list: CampaignPreview[]) {
  if (pendingRefetchCampaignId == null) return;
  const campaignId = pendingRefetchCampaignId;
  pendingRefetchCampaignId = null;
  if (!campaignGuardOk() || activeCampaign) return; // trạng thái đổi trong lúc chờ refetch (mở chat/snooze...)
  const fresh = list.find((c) => c.id === campaignId);
  if (fresh) showCompactPreview(fresh);
}

function showCompactPreview(campaign: CampaignPreview) {
  activeCampaign = campaign;
  const height = ui.showCampaignPreview(campaign, state.theme.launcher_label || '', {
    onClick: () => openFromCampaign(campaign),
    onDismiss: () => dismissPreview(),
  });
  post({ channel: WIDGET_CHANNEL, type: 'set_compact_view', height });
}

// AC5: bấm X → snooze 1h, đóng preview, KHÔNG tạo conversation.
function dismissPreview() {
  activeCampaign = null;
  setSnooze();
  ui.showLoading(); // dọn DOM khỏi trạng thái preview (widget đóng, không ai thấy — an toàn khi mở lại sau)
  post({ channel: WIDGET_CHANNEL, type: 'exit_compact_view', reason: 'dismiss' });
}

// AC4: click message preview → (nếu pre-chat bật) hiện form → handshake (kèm pre_chat nếu có) → POST trigger
// → vào chat. Loader mở khung đầy đủ NGAY khi nhận message 'handshake' trong lúc đang đóng (xem loader.ts).
function openFromCampaign(campaign: CampaignPreview) {
  if (activeCampaign?.id !== campaign.id) return; // đã bị dismiss/thay đổi giữa chừng — bỏ qua click trễ
  activeCampaign = null;
  pendingTriggerCampaignId = campaign.id;
  const needPreChat = state.preChat.enabled && preChatFieldsRequired() && !preChatDone();
  if (needPreChat) {
    ui.showPreChat(state.preChat, state.theme.greeting_text); // submit → handleSubmitPreChat() → post('handshake', preChat)
  } else {
    ui.showLoading();
    post({ channel: WIDGET_CHANNEL, type: 'handshake' });
  }
}

async function triggerCampaignThenContinue(campaignId: number): Promise<void> {
  try {
    await triggerCampaign(campaignId);
  } catch {
    /* best-effort — trigger lỗi không chặn mở chat (BE cũng idempotent/no-op an toàn) */
  }
  onSessionReady();
}

// story-08 AC3: đổi identity ⇒ đổi hội thoại. WidgetUI giữ mảng tin trong instance nên cách sạch nhất (và
// gọn nhất) là dựng instance mới; onSessionReady() ngay sau đó sẽ chạy lại enterChat() → loadHistory().
function resetForNewConversation() {
  inChat = false;
  messageCount = 0;
  firstMessageSent = false;
  pendingFirstMessage = null;
  pendingResend.length = 0;
  activeCampaign = null;
  unread = 0;
  post({ channel: WIDGET_CHANNEL, type: 'unread', count: 0 });
  awaitingPreChat = false;
  ui = createUi();
  ui.showLoading();
}

function onSessionReady() {
  // Sau khi có JWT mới: reconnect SSE + flush tin đang chờ gửi lại (JWT vừa hết hạn trước đó).
  if (inChat) {
    sse?.reconnectNow();
    flushPending();
    return;
  }
  if (awaitingPreChat) {
    awaitingPreChat = false;
    markPreChatDone();
    enterChat();
    return;
  }
  const needPreChat = state.preChat.enabled && preChatFieldsRequired() && !preChatDone();
  if (needPreChat) ui.showPreChat(state.preChat, state.theme.greeting_text);
  else enterChat();
}

function preChatFieldsRequired(): boolean {
  return state.preChat.require_name || state.preChat.require_phone || state.preChat.require_message;
}

// story-07 AC3/AC4: form pre-chat giờ có thêm ô "Tin nhắn" — message KHÔNG đi qua handshake (protocol/BE
// không nhận field này ở đây), chỉ giữ lại để gửi qua POST /message sau khi enterChat() có JWT.
function handleSubmitPreChat(name: string, phone: string, message: string) {
  awaitingPreChat = true;
  pendingFirstMessage = message || null;
  const preChat: { name?: string; phone?: string } = {};
  if (name) preChat.name = name;
  if (phone) preChat.phone = phone;
  // Re-handshake QUA loader (chỉ loader có Origin khách hợp lệ) để đính name/phone vào conversation.
  post({ channel: WIDGET_CHANNEL, type: 'handshake', pre_chat: preChat });
}

async function enterChat() {
  inChat = true;
  ui.showChat(state.theme.greeting_text);
  if (isOpen) ui.focusComposer(); // widget đang mở → bàn phím vào thẳng ô soạn tin
  // AC4: gửi tin đầu (nếu có) TRƯỚC loadHistory() — optimistic hiện "Đã gửi" khi lịch sử load xong ack lại.
  // Guard firstMessageSent: onSessionReady() có thể chạy lại (re-handshake) mà không nên gửi lặp.
  if (pendingFirstMessage && !firstMessageSent) {
    firstMessageSent = true;
    const text = pendingFirstMessage;
    pendingFirstMessage = null;
    handleSend(text);
  }
  await loadHistory();
  startSse();
}

async function loadHistory() {
  const res = await fetchMessages(0, 50);
  if (res.expired) {
    requestHandshake();
    return;
  }
  if (res.ok && res.data) {
    ui.setHistory(res.data);
    // story B-05: đồng bộ messageCount với lịch sử thật (vd handshake vừa xong sau trigger campaign đã chèn
    // 1 tin) — dùng max để không hạ thấp count đã đếm optimistic trong lúc fetch đang chạy.
    messageCount = Math.max(messageCount, res.data.length);
  }
}

function startSse() {
  if (sse) return;
  sse = new SseManager({
    onStaffMessage: (m) => {
      messageCount++;
      ui.addIncoming(m);
      // story-08 AC4: báo loader phát CustomEvent `cluvix-chat:message` cho trang khách — CHỈ metadata
      // (id + sent_at), KHÔNG nội dung tin. Tin nội bộ (src=2) BE đã không đẩy qua SSE cho visitor.
      post({ channel: WIDGET_CHANNEL, type: 'staff_message', id: m.id, sent_at: m.sent_at });
      if (!isOpen) {
        unread++;
        post({ channel: WIDGET_CHANNEL, type: 'unread', count: unread });
      }
    },
    onStaffTyping: () => ui.showStaffTyping(),
    onDowntimeRecovered: () => void loadHistory(), // bù tin lỡ khi mất kết nối > 3s
    onNeedRehandshake: () => requestHandshake(),
    onStateChange: (connected) => ui.setConnected(connected), // story-07 AC2
  });
  sse.start();
}

// ── gửi tin ──
function handleSend(text: string) {
  const echoId = uuid();
  messageCount++; // story B-05: visitor tự gửi tin → không hiện campaign preview nữa dù đang ở phiên này
  ui.addOptimistic(echoId, text);
  void deliver(echoId, text);
}

function resend(echoId: string, text: string) {
  ui.markSending(echoId);
  void deliver(echoId, text);
}

async function deliver(echoId: string, text: string) {
  const res = await sendMessage(echoId, text);
  if (res.ok && res.data) {
    ui.ackOptimistic(echoId, res.data);
    return;
  }
  if (res.expired) {
    // JWT hết hạn: giữ optimistic ở trạng thái 'đang gửi', xin JWT mới rồi gửi lại (trong suốt — AC4).
    pendingResend.push({ echoId, text });
    requestHandshake();
    return;
  }
  // 429 hoặc lỗi mạng → đánh dấu lỗi, cho chạm để thử lại (giữ nguyên echo_id).
  ui.markFailed(echoId);
}

function flushPending() {
  const items = pendingResend.splice(0, pendingResend.length);
  for (const it of items) void deliver(it.echoId, it.text);
}

// ── typing (throttle) ──
function handleTyping() {
  const now = Date.now();
  if (now - lastTypingAt < TYPING_THROTTLE_MS) return;
  lastTypingAt = now;
  void sendTyping();
}

// ── re-handshake ──
let handshakePending = false;
function requestHandshake() {
  if (handshakePending) return;
  handshakePending = true;
  post({ channel: WIDGET_CHANNEL, type: 'handshake' });
  // Cho phép xin lại sau 1.5s (đủ để loader trả session mới) — tránh spam nếu loader chưa phản hồi.
  window.setTimeout(() => (handshakePending = false), 1500);
}

// ── utils ──
function post(msg: IframeToLoader) {
  window.parent.postMessage(msg, parentOrigin || '*');
}

function referrerOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    return '';
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
