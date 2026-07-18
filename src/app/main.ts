// Iframe app entry (widget.html). Nhận session (jwt/config) TỪ loader qua postMessage (loader mới có
// đúng Origin website khách để handshake — xem loader.ts). Ở đây: pre-chat form → khung chat (history,
// optimistic send, SSE, typing), refresh JWT khi hết hạn, đếm unread báo loader.
import { WIDGET_CHANNEL, type IframeToLoader, type LoaderToIframe } from '../shared/protocol';
import { applySession, markPreChatDone, preChatDone, state } from './store';
import { fetchMessages, sendMessage, sendTyping } from './api';
import { SseManager } from './sse';
import { WidgetUI } from './ui';

const TYPING_THROTTLE_MS = 2500;

const params = new URLSearchParams(window.location.search);
state.siteKey = (params.get('site_key') || '').trim();

const parentOrigin = referrerOrigin();
const appRoot = document.getElementById('app') || document.body;

let ui: WidgetUI;
let sse: SseManager | null = null;
let isOpen = true; // iframe được loader tạo lúc mở → khởi đầu là đang mở
let unread = 0;
let inChat = false;
let awaitingPreChat = false;
let lastTypingAt = 0;
const pendingResend: { echoId: string; text: string }[] = [];

boot();

function boot() {
  ui = new WidgetUI(appRoot, state.theme, {
    onSend: handleSend,
    onTyping: handleTyping,
    onClose: () => post({ channel: WIDGET_CHANNEL, type: 'close' }),
    onSubmitPreChat: handleSubmitPreChat,
    onRetry: (echoId, text) => resend(echoId, text),
  });
  ui.showLoading();
  window.addEventListener('message', onLoaderMessage);
  // Báo loader iframe đã sẵn sàng nhận session.
  post({ channel: WIDGET_CHANNEL, type: 'ready' });
}

function onLoaderMessage(ev: MessageEvent) {
  if (ev.source !== window.parent) return; // chỉ nhận từ cửa sổ cha (loader)
  const msg = ev.data as LoaderToIframe;
  if (!msg || msg.channel !== WIDGET_CHANNEL) return;
  switch (msg.type) {
    case 'session':
      applySession(msg.data);
      ui.applyTheme(state.theme);
      onSessionReady();
      break;
    case 'session_error':
      ui.showOffline(msg.disabled ? state.theme.offline_text : 'Không kết nối được, vui lòng thử lại sau.');
      break;
    case 'opened':
      isOpen = true;
      unread = 0;
      post({ channel: WIDGET_CHANNEL, type: 'unread', count: 0 });
      break;
    case 'closed':
      isOpen = false;
      break;
  }
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
  const needPreChat =
    state.preChat.enabled && (state.preChat.require_name || state.preChat.require_phone) && !preChatDone();
  if (needPreChat) ui.showPreChat(state.preChat, state.theme.greeting_text);
  else enterChat();
}

function handleSubmitPreChat(name: string, phone: string) {
  awaitingPreChat = true;
  const preChat: { name?: string; phone?: string } = {};
  if (name) preChat.name = name;
  if (phone) preChat.phone = phone;
  // Re-handshake QUA loader (chỉ loader có Origin khách hợp lệ) để đính name/phone vào conversation.
  post({ channel: WIDGET_CHANNEL, type: 'handshake', pre_chat: preChat });
}

async function enterChat() {
  inChat = true;
  ui.showChat(state.theme.greeting_text);
  await loadHistory();
  startSse();
}

async function loadHistory() {
  const res = await fetchMessages(0, 50);
  if (res.expired) {
    requestHandshake();
    return;
  }
  if (res.ok && res.data) ui.setHistory(res.data);
}

function startSse() {
  if (sse) return;
  sse = new SseManager({
    onStaffMessage: (m) => {
      ui.addIncoming(m);
      if (!isOpen) {
        unread++;
        post({ channel: WIDGET_CHANNEL, type: 'unread', count: unread });
      }
    },
    onStaffTyping: () => ui.showStaffTyping(),
    onDowntimeRecovered: () => void loadHistory(), // bù tin lỡ khi mất kết nối > 3s
    onNeedRehandshake: () => requestHandshake(),
  });
  sse.start();
}

// ── gửi tin ──
function handleSend(text: string) {
  const echoId = uuid();
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
