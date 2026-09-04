// Cluvix Livechat — LOADER (widget.js). Chạy TRÊN TRANG KHÁCH (origin = website khách).
//
// KIẾN TRÚC (quan trọng — khác chữ AC3 nhưng BẮT BUỘC cho đúng bảo mật BE):
//   BE POST /api/client/livechat/session kiểm Origin ∈ allowed_origins (origin website khách). Chỉ
//   NGỮ CẢNH TRANG KHÁCH mới mang đúng Origin đó. Iframe widget.html serve từ domain Cluvix → Origin =
//   Cluvix ≠ allowed_origins → 403. Vì vậy TOÀN BỘ handshake /session chạy Ở LOADER (trang khách), rồi
//   trao visitor_jwt cho iframe qua postMessage. Iframe (cùng origin với /api) chỉ gọi message/messages/
//   typing/sse bằng JWT (các endpoint đó KHÔNG kiểm Origin, auth bằng JWT).
//
// Loader chịu trách nhiệm: bubble + iframe container (Shadow DOM cô lập CSS), là "session broker" (mọi
// handshake — mở đầu / pre-chat / refresh JWT hết hạn), unread badge, lưu visitor_token + trạng thái mở.
// KHÔNG analytics/cookie bên thứ 3; localStorage chỉ open state + cache config (AC) + visitor_token (site
// KHÔNG pre-chat, hết hạn 30 ngày — M5). Site CÓ pre-chat: visitor_token lưu sessionStorage (phiên tab —
// máy dùng chung không đọc lại hội thoại y tế của người trước qua resume token còn sót lại).
//
// story-08: loader còn là chủ của HỢP ĐỒNG MỞ NGUỒN với trang khách — `data-host` (tách origin backend khỏi
// origin phục vụ widget.js), `window.cluvixChat` (open/close/toggle/setUser/on/off) và CustomEvent
// `cluvix-chat:ready|opened|closed|message`. Identity (identifier + identifier_hash do SERVER partner ký)
// chỉ nằm TRONG BỘ NHỚ, KHÔNG localStorage. ⚠ KHÔNG BAO GIỜ đọc `identity_secret` từ DOM/JS: secret ở lại
// server partner, trang khách chỉ nhúng hash đã ký.

import { WIDGET_CHANNEL, type IframeToLoader, type LoaderToIframe } from './shared/protocol';
import { pickLocale, t, type Dict, type Locale } from './shared/strings';
import { onPrimaryColor, primaryStrong } from './shared/color';
import {
  defaultThemeFor,
  type SessionData,
  type WidgetTheme,
  type ClientEnvelope,
  type CampaignPreview,
  type CampaignsData,
  type WidgetIdentity,
} from './shared/types';

const CAMPAIGNS_TTL_MS = 60 * 60 * 1000; // AC2: cache 1h theo siteKey
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // M5: token ẩn danh (site KHÔNG pre-chat) hết hạn sau 30 ngày
const LOG = '[cluvix-livechat]';
const SET_USER_THROTTLE_MS = 2000; // story-08: chặn re-handshake storm khi partner gọi setUser liên tục
const FRAME_ANIM_MS = 180; // story-08 AC5 — phải khớp transition trong shadowCss()
const FRAME_HIDE_FALLBACK_MS = 250; // dự phòng khi transitionend không bắn (tab ẩn, reduced-motion…)
const DEFAULT_OFFSET = 20; // px — khoảng cách mặc định nút mở chat tới mép (theme.launcher_offset_x/y)
const DARK_RING = '#161b22'; // = --lc-bg chế độ tối trong app/styles.ts (vòng viền badge trên nền tối)

/** Tên event public phát ra `window` (hợp đồng mở nguồn — arch §3.3). */
type PublicEventName = 'ready' | 'opened' | 'closed' | 'message';

/** API công khai gắn vào `window.cluvixChat` (story-08 AC3). */
interface CluvixChatApi {
  open(): void;
  close(): void;
  toggle(): void;
  setUser(user: unknown): void;
  on(name: PublicEventName, cb: EventListener): void;
  off(name: PublicEventName, cb: EventListener): void;
}

declare global {
  interface Window {
    cluvixChat?: CluvixChatApi;
  }
}

interface Bootstrap {
  siteKey: string;
  apiBase: string; // origin backend — `data-host` nếu có, else origin nơi widget.js được serve
  identity: WidgetIdentity | null; // story-08 AC2 — identity ban đầu từ data-user-*
}

/**
 * story-08 AC1: chỉ chấp nhận ORIGIN THUẦN (scheme + host[:port], không path/query/hash/credentials).
 * https bất kỳ; http chỉ cho localhost/127.0.0.1 (mirror luật allowed_origins của BE).
 */
function isAllowedHost(v: string): boolean {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.origin !== v) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/**
 * story-08 AC2/AC3: chuẩn hoá + validate identity. `identifier` 1..128 ký tự, `identifier_hash` đúng 64 hex.
 * KHÔNG hợp lệ → null (gọi bên ngoài tự log). KHÔNG đọc/chấp nhận bất kỳ "secret" nào từ DOM: hash phải do
 * SERVER của partner ký sẵn.
 */
function normalizeIdentity(raw: unknown): WidgetIdentity | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const identifier = typeof o.identifier === 'string' ? o.identifier.trim() : '';
  const hash = typeof o.identifier_hash === 'string' ? o.identifier_hash.trim() : '';
  if (identifier.length < 1 || identifier.length > 128) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return null;
  const out: WidgetIdentity = { identifier, identifier_hash: hash.toLowerCase() };
  for (const k of ['name', 'phone', 'email'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function readIdentityAttrs(el: HTMLScriptElement): WidgetIdentity | null {
  const identifier = (el.getAttribute('data-user-id') || '').trim();
  const hash = (el.getAttribute('data-user-hash') || '').trim();
  if (!identifier && !hash) return null; // không khai báo identity → luồng ẩn danh như cũ
  const identity = normalizeIdentity({
    identifier,
    identifier_hash: hash,
    name: el.getAttribute('data-user-name') || undefined,
    phone: el.getAttribute('data-user-phone') || undefined,
    email: el.getAttribute('data-user-email') || undefined,
  });
  if (!identity) {
    console.error(
      `${LOG} invalid data-user-id/data-user-hash (identifier 1..128 chars, hash 64 hex) — identity ignored, falling back to an anonymous chat.`,
    );
  }
  return identity;
}

function readBootstrap(): Bootstrap | null {
  // document.currentScript chỉ có trong lúc script chạy đồng bộ; script nhúng async vẫn trỏ đúng tag.
  const el =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-site-key][src*="widget.js"]');
  if (!el) return null;
  const siteKey = (el.getAttribute('data-site-key') || '').trim();
  if (!siteKey) {
    console.error(`${LOG} missing data-site-key on the <script> tag — widget NOT loaded.`);
    return null;
  }
  // story-08 AC1: data-host tách origin backend khỏi origin phục vụ widget.js (CDN riêng, reverse proxy…).
  const rawHost = (el.getAttribute('data-host') || '').trim().replace(/\/+$/, '');
  let apiBase: string;
  if (rawHost) {
    if (!isAllowedHost(rawHost)) {
      console.error(
        `${LOG} invalid data-host: "${rawHost}" — expected a bare origin like https://host[:port] (http is only allowed for localhost/127.0.0.1). Widget NOT loaded.`,
      );
      return null;
    }
    apiBase = rawHost;
  } else {
    try {
      apiBase = new URL(el.src).origin; // hành vi cũ: cùng origin với widget.js
    } catch {
      apiBase = window.location.origin;
    }
  }
  return { siteKey, apiBase, identity: readIdentityAttrs(el) };
}

const boot = readBootstrap();
if (boot) start(boot);

function start({ siteKey, apiBase, identity: bootIdentity }: Bootstrap) {
  const LS_TOKEN = `cluvix_lc_token_${siteKey}`;
  const LS_OPEN = `cluvix_lc_open_${siteKey}`;
  const LS_CFG = `cluvix_lc_cfg_${siteKey}`;
  const LS_CAMPAIGNS = `cluvix_lc_campaigns_${siteKey}`;
  const widgetOrigin = apiBase; // widget.html serve cùng domain backend (webhookBase); iframe.origin = apiBase

  const lsGet = (k: string): string | null => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const lsSet = (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode: bỏ qua, widget vẫn chạy phiên hiện tại */
    }
  };
  const lsRemove = (k: string) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  };
  const ssGet = (k: string): string | null => {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const ssSet = (k: string, v: string) => {
    try {
      window.sessionStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  };
  const ssRemove = (k: string) => {
    try {
      window.sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  };

  // ── M5: visitor_token — site có pre-chat bật lưu ở sessionStorage (phiên tab; máy dùng chung không đọc
  // lại hội thoại y tế của người trước qua resume token). Site KHÔNG pre-chat vẫn dùng localStorage (tiện
  // resume qua nhiều phiên trình duyệt) nhưng có hạn 30 ngày, ghi kèm `ts`. Đọc: chưa biết site có pre-chat
  // hay chưa (chạy TRƯỚC khi handshake trả config) nên thử sessionStorage trước, rồi localStorage (kèm
  // check TTL); tương thích ngược đọc được cả giá trị cũ dạng chuỗi trần (trước bản vá này, không có `ts`).
  function readLocalToken(): string | null {
    const raw = lsGet(LS_TOKEN);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { token?: string; ts?: number };
      if (parsed && typeof parsed.token === 'string') {
        if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > TOKEN_TTL_MS) {
          lsRemove(LS_TOKEN);
          return null;
        }
        return parsed.token;
      }
    } catch {
      return raw; // chuỗi trần cũ (trước bản vá) — chưa có ts, không tự xoá dữ liệu hợp lệ trước đó
    }
    return null;
  }

  function readSavedToken(): string | null {
    return ssGet(LS_TOKEN) || readLocalToken();
  }

  function writeToken(token: string, preChatEnabled: boolean) {
    if (preChatEnabled) {
      ssSet(LS_TOKEN, token);
      lsRemove(LS_TOKEN); // site vừa đổi sang bật pre-chat — dọn token cũ còn ở localStorage
    } else {
      lsSet(LS_TOKEN, JSON.stringify({ token, ts: Date.now() }));
      ssRemove(LS_TOKEN);
    }
  }

  // ── state ──
  let session: SessionData | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let iframeReady = false;
  let isOpen = false;
  let unread = 0;
  let handshaking = false;
  let lastError: { disabled: boolean } | null = null; // buffer lỗi handshake nếu iframe chưa 'ready'
  // Locale: `<html lang>` của TRANG KHÁCH chỉ đọc được ở đây (iframe khác origin) — loader chốt rồi gửi
  // xuống iframe kèm message `session`. Vòng 2 lượt vì `widget_theme.locale` (ưu tiên cao nhất) nằm trong
  // chính theme cache mà theme mặc định lại phụ thuộc locale.
  const htmlLang = document.documentElement.getAttribute('lang');
  const navLang = typeof navigator !== 'undefined' ? navigator.language : null;
  let locale: Locale = pickLocale({ htmlLang, navigatorLang: navLang });
  let cachedTheme: WidgetTheme = readCachedTheme(locale);
  locale = pickLocale({ themeLocale: cachedTheme.locale, htmlLang, navigatorLang: navLang });
  cachedTheme = readCachedTheme(locale);
  let S: Dict = t(locale);
  let campaigns: CampaignPreview[] = []; // story B-04 (AC2) — buffer để gửi lại khi iframe 'ready' sau
  let lastSentUrl: string | null = null; // story B-04 (AC1) — tránh gửi trùng url_changed khi không đổi
  // story-08: identity CHỈ trong memory (KHÔNG localStorage — hash là thông tin phiên của partner; reload
  // trang partner sẽ nhúng lại data-user-* hoặc gọi setUser()).
  let identity: WidgetIdentity | null = bootIdentity;
  let lastSetUserAt = 0;
  let mounted = false;
  const pendingApiCalls: Array<() => void> = []; // lệnh public API gọi TRƯỚC khi mount xong → xếp hàng

  // ── story-08 AC4: CustomEvent public trên window ──
  function emit(name: PublicEventName, detail?: unknown) {
    try {
      window.dispatchEvent(
        detail === undefined
          ? new CustomEvent(`cluvix-chat:${name}`)
          : new CustomEvent(`cluvix-chat:${name}`, { detail }),
      );
    } catch {
      /* trang khách có polyfill lạ ghi đè CustomEvent — không để vỡ widget */
    }
  }

  function runOrQueue(fn: () => void) {
    if (mounted) fn();
    else pendingApiCalls.push(fn);
  }

  function readCachedTheme(loc: Locale): WidgetTheme {
    const raw = lsGet(LS_CFG);
    if (raw) {
      try {
        const cfg = JSON.parse(raw) as { widget_theme?: WidgetTheme | null };
        if (cfg.widget_theme) return { ...defaultThemeFor(loc), ...cfg.widget_theme };
      } catch {
        /* ignore */
      }
    }
    return defaultThemeFor(loc);
  }

  // ── story B-04: campaign list (fetch 1 lần, cache 1h) ──
  // Fetch ĐỘC LẬP handshake/session — campaign phải sẵn sàng TRƯỚC khi visitor mở chat. Loader (Origin
  // trang khách) là nơi DUY NHẤT gọi được endpoint này (BE check Origin ∈ allowed_origins, mirror /session);
  // iframe (Origin Cluvix) không tự fetch được nên loader gửi list qua postMessage.
  function readCachedCampaigns(): CampaignPreview[] | null {
    const raw = lsGet(LS_CAMPAIGNS);
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw) as { ts?: number; list?: CampaignPreview[] };
      if (!cached || typeof cached.ts !== 'number' || !Array.isArray(cached.list)) return null;
      if (Date.now() - cached.ts > CAMPAIGNS_TTL_MS) return null;
      return cached.list;
    } catch {
      return null;
    }
  }

  // story B-05 (AC3): `force=true` bỏ qua cache localStorage — dùng khi iframe xin refetch trước khi hiện
  // compact-preview (double-check campaign còn `enabled`, admin có thể vừa tắt).
  async function loadCampaigns(force = false): Promise<void> {
    if (!force) {
      const cached = readCachedCampaigns();
      if (cached) {
        campaigns = cached;
        postToIframe({ channel: WIDGET_CHANNEL, type: 'campaigns', list: campaigns });
        return;
      }
    }
    try {
      const res = await fetch(`${apiBase}/api/client/livechat/campaigns?site_key=${encodeURIComponent(siteKey)}`);
      const env = (await res.json()) as ClientEnvelope<CampaignsData>;
      if (!env || env.success !== true || !env.data || !Array.isArray(env.data.campaigns)) return; // site tắt/lỗi → im lặng, không phá trang khách
      campaigns = env.data.campaigns;
      lsSet(LS_CAMPAIGNS, JSON.stringify({ ts: Date.now(), list: campaigns }));
      postToIframe({ channel: WIDGET_CHANNEL, type: 'campaigns', list: campaigns });
    } catch {
      /* lỗi mạng: bỏ qua — campaign là tính năng cộng thêm, không chặn chat lõi */
    }
  }

  // ── story B-04: theo dõi URL đổi (kể cả SPA không reload — AC1) ──
  function sendUrlIfChanged(url: string, force = false) {
    if (!force && url === lastSentUrl) return;
    lastSentUrl = url;
    postToIframe({ channel: WIDGET_CHANNEL, type: 'url_changed', url });
  }

  function trackUrlChanges() {
    const wrap = <K extends 'pushState' | 'replaceState'>(key: K) => {
      const original = history[key].bind(history);
      history[key] = ((...args: Parameters<History[K]>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ret = (original as any)(...args);
        queueUrlCheck();
        return ret;
      }) as History[K];
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', queueUrlCheck);
    window.addEventListener('hashchange', queueUrlCheck);
    // Fallback cho SPA lạ không dùng history API (Chatwoot DOMHelpers.js:49-75): quan sát DOM, coalesce
    // (setTimeout 50ms) để không spam so sánh href liên tục trên trang thay đổi DOM nhiều.
    let scheduled = false;
    const mo = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        sendUrlIfChanged(location.href);
      }, 50);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  let urlCheckQueued = false;
  function queueUrlCheck() {
    if (urlCheckQueued) return;
    urlCheckQueued = true;
    // setTimeout 0: pushState/replaceState cập nhật location.href đồng bộ nhưng tách khỏi lệnh gọi lồng nhau.
    window.setTimeout(() => {
      urlCheckQueued = false;
      sendUrlIfChanged(location.href);
    }, 0);
  }

  // ── Shadow DOM host (cô lập CSS 2 chiều, z-index rất cao) ──
  const host = document.createElement('div');
  host.setAttribute('data-cluvix-livechat', '');
  host.style.cssText = 'position:fixed;z-index:2147483000;top:0;left:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = shadowCss();
  root.appendChild(style);

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'lc-launcher';
  // aria-label = động từ + nhãn ("Mở khung chat: Tư vấn") — chỉ nhãn thương hiệu thì screen reader không
  // biết bấm vào sẽ xảy ra gì. aria-expanded/aria-haspopup mô tả quan hệ với khung chat (dialog).
  launcher.setAttribute('aria-label', `${S.openChat}: ${S.launcherDefault}`);
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  // Pill icon + chữ (mặc định theo locale, admin đổi qua theme.launcher_label) — chỉ icon thì khách không
  // biết đó là gì. Khi khung mở, nút ẩn hẳn (CSS .lc-launcher.lc-open{display:none}).
  launcher.innerHTML = `${chatIcon()}<span class="lc-launcher-label"></span><span class="lc-badge" hidden></span>`;
  const launcherLabelEl = launcher.querySelector<HTMLSpanElement>('.lc-launcher-label')!;
  launcherLabelEl.textContent = S.launcherDefault;
  root.appendChild(launcher);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'lc-frame-wrap';
  frameWrap.hidden = true;
  frameWrap.setAttribute('role', 'dialog');
  frameWrap.setAttribute('aria-label', S.launcherDefault);
  root.appendChild(frameWrap);

  const badgeEl = launcher.querySelector<HTMLSpanElement>('.lc-badge')!;

  // story-08 AC3: gắn API TRƯỚC khi kích mount — script nhúng async có thể load sau DOMContentLoaded, lúc
  // đó mount() (và event `ready`) chạy NGAY ở dòng dưới; `window.cluvixChat` phải tồn tại trước thời điểm đó.
  const api: CluvixChatApi = {
    open: () => runOrQueue(() => open()),
    close: () => runOrQueue(() => close()),
    toggle: () => runOrQueue(() => (isOpen ? close() : open())),
    setUser: (u: unknown) => runOrQueue(() => setUser(u)),
    on: (name, cb) => window.addEventListener(`cluvix-chat:${name}`, cb),
    off: (name, cb) => window.removeEventListener(`cluvix-chat:${name}`, cb),
  };
  window.cluvixChat = api;

  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();

  function mount() {
    if (host.isConnected) return;
    document.body.appendChild(host);
    applyThemeToLauncher(cachedTheme);
    trackUrlChanges(); // story B-04 (AC1) — cần document.body cho MutationObserver fallback
    void loadCampaigns(); // story B-04 (AC2) — độc lập handshake, chạy TRƯỚC khi visitor mở chat
    // story B-05 (CRITICAL): mount iframe NGAY, ẨN (frameWrap.hidden vẫn true) — để timer campaign
    // (CampaignMatcher trong iframe) chạy được ngay cả khi widget đang đóng. KHÔNG chờ open()/click.
    // Iframe 'ready' KHÔNG tự handshake (xem case 'ready' bên dưới) nên việc mount sớm không tạo
    // conversation/handshake ngoài ý muốn.
    ensureIframe();
    // story-08 AC3/AC4: mount xong → public API hết "xếp hàng", phát `ready` ĐÚNG 1 LẦN (mount() có guard
    // isConnected ở đầu nên không chạy 2 lần), rồi mới chạy các lệnh đã xếp hàng trước đó.
    mounted = true;
    emit('ready');
    const queued = pendingApiCalls.splice(0, pendingApiCalls.length);
    for (const fn of queued) fn();
    // Khôi phục trạng thái mở (nếu tab trước để mở) — chỉ auto-mở trên desktop để không chiếm màn mobile.
    if (lsGet(LS_OPEN) === '1' && !isMobile()) open();
  }

  launcher.addEventListener('click', () => (isOpen ? close() : open()));
  // Escape ở TRANG CHA đóng khung (iframe tự bắt Escape của nó rồi post 'close' — main.ts).
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isOpen) close();
  });

  // ── mở / đóng ──
  // story B-05: tách phần "hiện khung đầy đủ" (showFullFrame) khỏi phần "đảm bảo có session" (ensureSession)
  // — click preview compact cần mở khung đầy đủ NGAY (trước cả khi biết có cần pre-chat form hay không),
  // nhưng handshake chỉ chạy khi iframe chủ động xin qua message 'handshake' (giữ đúng rule "handshake chỉ
  // khi mở chat thật", tránh 2 nơi cùng gọi handshake).
  // ── story-08 AC5: animation khung (scale+fade 180ms, transform-origin ở góc bubble) ──
  // Khung phải rời khỏi luồng (`display:none` qua thuộc tính `hidden`) khi đóng — nếu chỉ để opacity:0 nó
  // vẫn nuốt click của trang khách. Vì vậy: mở = bỏ hidden → reflow → thêm class .lc-in; đóng = bỏ .lc-in →
  // đợi transitionend (fallback timeout) → set hidden.
  let hideTimer = 0;

  function prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function showWrap() {
    window.clearTimeout(hideTimer);
    frameWrap.hidden = false;
    // Ép reflow: không có bước này trình duyệt gộp "bỏ hidden" + "thêm class" thành 1 style pass ⇒ không animate.
    void frameWrap.offsetWidth;
    frameWrap.classList.add('lc-in');
  }

  function hideWrap() {
    if (frameWrap.hidden) return;
    frameWrap.classList.remove('lc-in');
    window.clearTimeout(hideTimer);
    if (prefersReducedMotion()) {
      finishHide();
      return;
    }
    hideTimer = window.setTimeout(finishHide, FRAME_HIDE_FALLBACK_MS);
  }

  function finishHide() {
    window.clearTimeout(hideTimer);
    if (frameWrap.classList.contains('lc-in')) return; // đã mở lại giữa chừng → huỷ việc ẩn
    frameWrap.hidden = true;
    frameWrap.classList.remove('lc-compact');
    unbindViewportFit(); // gỡ listener visualViewport + trả lại height/top/bottom cho CSS
  }

  frameWrap.addEventListener('transitionend', (ev) => {
    const te = ev as TransitionEvent;
    if (te.target !== frameWrap || te.propertyName !== 'transform') return;
    if (!frameWrap.classList.contains('lc-in')) finishHide();
  });

  // ── v1.3.0: bàn phím ảo iOS che ô soạn tin ──
  // Trên mobile khung chat là full-screen (top/bottom:0). Safari iOS KHÔNG thu nhỏ layout viewport khi bàn
  // phím bật ⇒ nửa dưới khung (composer) nằm SAU bàn phím, gõ không thấy chữ. visualViewport cho biết
  // phần thực sự nhìn thấy: ghim khung theo đúng vùng đó. Chỉ áp cho mobile + khung ĐANG mở đầy đủ —
  // desktop và compact-preview giữ nguyên layout CSS.
  let vvBound = false;

  function clearViewportFit() {
    frameWrap.style.height = '';
    frameWrap.style.top = '';
    frameWrap.style.bottom = '';
  }

  function syncViewportFit() {
    const vv = window.visualViewport;
    if (!vv) return;
    if (!isOpen || !isMobile() || frameWrap.classList.contains('lc-compact')) {
      // Xoay ngang / đổi cỡ cửa sổ khiến không còn là mobile → trả lại layout CSS ngay.
      if (frameWrap.style.height || frameWrap.style.top) clearViewportFit();
      return;
    }
    frameWrap.style.height = `${Math.round(vv.height)}px`;
    frameWrap.style.top = `${Math.round(vv.offsetTop)}px`;
    frameWrap.style.bottom = 'auto';
  }

  function bindViewportFit() {
    const vv = window.visualViewport;
    if (!vv || vvBound) return;
    vvBound = true;
    vv.addEventListener('resize', syncViewportFit);
    vv.addEventListener('scroll', syncViewportFit);
    syncViewportFit();
  }

  function unbindViewportFit() {
    const vv = window.visualViewport;
    if (vv && vvBound) {
      vv.removeEventListener('resize', syncViewportFit);
      vv.removeEventListener('scroll', syncViewportFit);
    }
    vvBound = false;
    clearViewportFit();
  }

  function showFullFrame() {
    const wasOpen = isOpen;
    isOpen = true;
    lsSet(LS_OPEN, '1');
    unread = 0;
    renderBadge();
    frameWrap.classList.remove('lc-compact');
    frameWrap.style.height = '';
    showWrap();
    if (isMobile()) bindViewportFit();
    launcher.classList.add('lc-open');
    launcher.setAttribute('aria-expanded', 'true');
    ensureIframe();
    focusIframeWhenReady();
    postToIframe({ channel: WIDGET_CHANNEL, type: 'opened' });
    if (!wasOpen) emit('opened'); // AC4 — chỉ phát khi THỰC SỰ chuyển trạng thái
  }

  function open() {
    showFullFrame();
    // Bảo đảm có session (handshake nếu chưa) — mở bubble là thời điểm handshake (trước đó bubble dùng default/cache).
    void ensureSession();
  }

  function close() {
    const wasOpen = isOpen;
    isOpen = false;
    lsSet(LS_OPEN, '0');
    hideWrap();
    launcher.classList.remove('lc-open');
    launcher.setAttribute('aria-expanded', 'false');
    postToIframe({ channel: WIDGET_CHANNEL, type: 'closed' });
    // Trả focus về nút vừa mở khung — nếu không, focus rơi về <body> và người dùng bàn phím mất chỗ đứng.
    if (wasOpen) launcher.focus();
    if (wasOpen) emit('closed'); // AC4
  }

  // ── story B-05: compact-preview (widget đóng, hiện bong bóng nhỏ mời chat) ──
  function showCompactFrame(height: number) {
    ensureIframe();
    unbindViewportFit(); // compact tự set height riêng — không để ghim theo visualViewport đè lên
    frameWrap.classList.add('lc-compact');
    frameWrap.style.height = `${Math.max(60, Math.round(height))}px`;
    showWrap(); // story-08 AC5: dùng chung đường hiện khung (fade+scale) — compact vẫn giữ layout riêng
    // isOpen CỐ Ý giữ nguyên false — compact-preview không phải "mở chat thật" (không handshake).
  }

  function hideCompactFrame() {
    if (!isOpen) {
      hideWrap(); // finishHide() sẽ gỡ .lc-compact + height sau khi animation xong
      return;
    }
    frameWrap.classList.remove('lc-compact');
    clearViewportFit();
    if (isMobile()) bindViewportFit(); // quay lại khung đầy đủ đang mở → ghim lại theo visualViewport
  }

  // Focus vào iframe ngay khi mở (nội dung khung nằm trong document khác — không focus thì Tab tiếp theo
  // đi vào trang khách chứ không vào khung chat). Iframe có thể chưa 'ready' → hẹn lại ở case 'ready'.
  let focusFrameOnReady = false;
  function focusIframeWhenReady() {
    if (iframe && iframeReady) iframe.focus();
    else focusFrameOnReady = true;
  }

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.className = 'lc-frame';
    iframe.title = S.frameTitle;
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.src = `${widgetOrigin}/widget.html?site_key=${encodeURIComponent(siteKey)}`;
    frameWrap.appendChild(iframe);
  }

  // ── handshake (session broker) ──
  async function ensureSession(): Promise<void> {
    if (session || handshaking) return;
    await handshake();
  }

  async function handshake(preChat?: { name?: string; phone?: string }): Promise<void> {
    if (handshaking) return;
    handshaking = true;
    // story-08: identity có thể đổi NGAY TRONG LÚC request đang bay (setUser gọi giữa chừng) — ghi lại cái
    // đang dùng để cuối lượt tự handshake bù, tránh phiên "kẹt" ở identity cũ mà không ai kích lại.
    const usedIdentifier = identity ? identity.identifier : null;
    try {
      const token = readSavedToken() || undefined;
      const body: Record<string, unknown> = { site_key: siteKey };
      // story-08 AC2: có identity → gửi identity, KHÔNG gửi visitor_token. BE cũng bỏ qua token khi có
      // identity (arch §3.2 bước 4 — chống nhảy sang hội thoại ẩn danh bằng identity), loader không gửi
      // cho rõ ràng và để không lộ token ẩn danh vào request đã xác thực.
      if (identity) body.identity = identity;
      else if (token) body.visitor_token = token;
      if (preChat) body.pre_chat = preChat;

      const res = await fetch(`${apiBase}/api/client/livechat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const env = (await res.json()) as ClientEnvelope<SessionData>;
      if (!env || env.success !== true || !env.data || !env.data.visitor_jwt) {
        // 403 (site tắt/origin/không hợp lệ) → báo iframe hiển thị trạng thái không khả dụng.
        const disabled = !env || env.code === 403;
        lastError = { disabled };
        postToIframe({ channel: WIDGET_CHANNEL, type: 'session_error', disabled });
        return;
      }
      lastError = null;
      session = env.data;
      // story-08: KHÔNG lưu visitor_token của phiên ĐÃ XÁC THỰC vào localStorage/sessionStorage — token đó
      // resume được hội thoại có danh tính; máy dùng chung / partner logout mà token còn nằm lại là rò hội
      // thoại. Phiên identity resume bằng chính identifier (BE tra `idv:` — arch §3.2 bước 4), không cần
      // token. M5(b): BE có thể trả visitor_token MỚI khác token đã gửi (vd site đổi chính sách) — luôn ghi
      // đè vô điều kiện, không so sánh với token cũ.
      if (!identity) writeToken(session.visitor_token, session.config?.pre_chat_form?.enabled === true);
      lsSet(LS_CFG, JSON.stringify(session.config || {}));
      const themeCfg = session.config?.widget_theme;
      // Locale của theme (nếu admin đặt) thắng — phải chốt TRƯỚC khi trộn default, vì greeting/offline
      // mặc định lấy theo locale. applyThemeToLauncher() ngay dưới cũng chốt lại đúng công thức này.
      const themeLocale = pickLocale({ themeLocale: themeCfg?.locale, htmlLang, navigatorLang: navLang });
      cachedTheme = themeCfg ? { ...defaultThemeFor(themeLocale), ...themeCfg } : defaultThemeFor(themeLocale);
      applyThemeToLauncher(cachedTheme);
      postSession();
    } catch {
      lastError = { disabled: false };
      postToIframe({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: false });
    } finally {
      handshaking = false;
    }
    // Identity đổi giữa lượt vừa rồi → phiên hiện tại không còn đúng người: handshake bù đúng 1 lần.
    if (session && (identity ? identity.identifier : null) !== usedIdentifier) {
      session = null;
      void handshake();
    }
  }

  // ── postMessage bridge ──
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.origin !== widgetOrigin) return; // chỉ nhận từ iframe của mình
    const msg = ev.data as IframeToLoader;
    if (!msg || msg.channel !== WIDGET_CHANNEL) return;
    switch (msg.type) {
      case 'ready':
        iframeReady = true;
        if (focusFrameOnReady && isOpen) {
          focusFrameOnReady = false;
          iframe?.focus();
        }
        if (session) postSession();
        else if (lastError) postToIframe({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: lastError.disabled });
        // story B-05 (CRITICAL): KHÔNG tự ensureSession() ở đây. Iframe giờ mount ẨN ngay từ boot (không
        // chờ open()) — nếu handshake tự động mỗi khi iframe 'ready', MỌI page-load sẽ tạo conversation dù
        // visitor chưa hề mở chat (vi phạm rule "handshake chỉ khi mở chat"). Handshake CHỈ chạy khi iframe
        // chủ động xin qua message 'handshake' (mở bubble → open() gọi ensureSession(); click compact-preview
        // → app.ts tự post 'handshake' sau bước exit_compact_view/pre-chat).
        // isOpen có thể đã true ở đây (khôi phục trạng thái mở từ tab trước, mount() gọi open() trước khi
        // iframe kịp 'ready' → message 'opened' gốc bị rớt vì iframeReady lúc đó còn false) — gửi bù lại.
        if (isOpen) postToIframe({ channel: WIDGET_CHANNEL, type: 'opened' });
        // story B-04: iframe vừa mount → gửi ngay campaign list đã có (nếu fetch xong trước đó) + URL hiện
        // tại (force=true: đây là lần gửi ĐẦU cho iframe này dù URL chưa đổi kể từ lần gửi trước).
        if (campaigns.length) postToIframe({ channel: WIDGET_CHANNEL, type: 'campaigns', list: campaigns });
        sendUrlIfChanged(location.href, true);
        break;
      case 'handshake':
        // Iframe xin (re)handshake: pre_chat (submit form) hoặc refresh JWT (undefined). Xoá session cũ để
        // handshake lại (JWT mới), giữ nguyên conversation qua visitor_token đã lưu.
        // story B-05: click compact-preview gọi 'handshake' trong khi widget đang ĐÓNG (isOpen=false) — mở
        // khung đầy đủ NGAY trước khi handshake chạy (tránh hiện pre-chat form trong khung nhỏ compact).
        if (!isOpen) showFullFrame();
        session = null;
        void handshake(msg.pre_chat);
        break;
      case 'close':
        close();
        break;
      case 'unread':
        if (!isOpen) {
          unread = msg.count;
          renderBadge();
        }
        break;
      case 'campaign_ready':
        // Chỉ tín hiệu quan sát — B-05 tự xử lý toàn bộ luồng preview trong iframe (xem protocol.ts).
        break;
      case 'set_compact_view':
        showCompactFrame(msg.height);
        break;
      case 'exit_compact_view':
        if (msg.reason === 'open') showFullFrame();
        else hideCompactFrame();
        break;
      case 'refetch_campaigns':
        void loadCampaigns(true);
        break;
      case 'staff_message':
        // story-08 AC4: phát event public — CHỈ metadata (conversation_id + sent_at), KHÔNG nội dung tin.
        emit('message', { conversation_id: session?.conversation_id ?? 0, sent_at: msg.sent_at });
        break;
    }
  });

  /** Gửi session kèm locale đã chốt (iframe không đọc được `<html lang>` của trang khách). */
  function postSession() {
    if (session) postToIframe({ channel: WIDGET_CHANNEL, type: 'session', data: session, locale });
  }

  function postToIframe(msg: LoaderToIframe) {
    if (iframe && iframeReady && iframe.contentWindow) {
      iframe.contentWindow.postMessage(msg, widgetOrigin);
    }
  }

  // ── theme + badge ──
  function applyThemeToLauncher(theme: WidgetTheme) {
    locale = pickLocale({ themeLocale: theme.locale, htmlLang, navigatorLang: navLang });
    S = t(locale);
    // Nền nút = primary ĐÃ làm tối tới ngưỡng WCAG AA; chữ/outline = màu đối lập tính theo contrast thật.
    const strong = primaryStrong(theme.primary_color);
    const onPrimary = onPrimaryColor(strong);
    const scheme = theme.color_scheme === 'light' || theme.color_scheme === 'dark' ? theme.color_scheme : 'auto';
    style.textContent = shadowCss(
      theme.primary_color,
      theme.position === 'left',
      onPrimary,
      strong,
      scheme,
      offsetPx(theme.launcher_offset_x),
      offsetPx(theme.launcher_offset_y),
    );
    const label = (theme.launcher_label || '').trim() || S.launcherDefault;
    launcherLabelEl.textContent = label; // textContent — theme là dữ liệu admin, không innerHTML
    launcher.setAttribute('aria-label', `${S.openChat}: ${label}`);
    launcher.title = label;
    frameWrap.setAttribute('aria-label', label);
    if (iframe) iframe.title = S.frameTitle;
  }

  function renderBadge() {
    if (unread > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      badgeEl.hidden = true;
    }
  }

  function renderBadgeSafe() {
    try {
      renderBadge();
    } catch {
      /* noop */
    }
  }
  renderBadgeSafe();

  function isMobile(): boolean {
    return window.matchMedia('(max-width: 480px)').matches;
  }

  // ── story-08 AC3: public JS API (hợp đồng mở nguồn — arch §3.3) ──
  // Lệnh gọi TRƯỚC khi mount xong được xếp hàng và chạy ngay sau khi phát `ready` (trang khách nhúng async
  // nên rất dễ gọi cluvixChat.open() sớm hơn DOMContentLoaded).
  function setUser(raw: unknown) {
    const next = normalizeIdentity(raw);
    if (!next) {
      console.error(
        `${LOG} setUser: expected {identifier (1..128 chars), identifier_hash (64 hex)} — call ignored.`,
      );
      return;
    }
    // No-op khi identifier VÀ hash đều trùng cái đang áp — và handshake trước đó không lỗi. Nếu handshake
    // trước đó lỗi (lastError sau 403), setUser lặp lại (kể cả cùng identity, hash mới) phải kích lại, không
    // để widget kẹt offline vĩnh viễn.
    if (
      identity &&
      identity.identifier === next.identifier &&
      identity.identifier_hash === next.identifier_hash &&
      !lastError
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastSetUserAt < SET_USER_THROTTLE_MS) {
      console.error(`${LOG} setUser ignored: called too often (at most once per ${SET_USER_THROTTLE_MS / 1000}s).`);
      return;
    }
    lastSetUserAt = now;
    identity = next;
    // Đã có phiên (ẩn danh hoặc identity khác), đã lỗi handshake trước đó, hoặc widget đang mở → re-handshake
    // ngay: BE trả conversation_id khác, loader gửi `session` mới vào iframe, iframe nạp lại lịch sử theo
    // đúng đường requestHandshake hiện có.
    if (session || lastError || isOpen) {
      session = null;
      void handshake();
    }
  }

}

// ── assets ──
function chatIcon(): string {
  return `<svg class="lc-ic" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.3 1.1 4.3 2.9 5.8L4 21l4.3-1.6c1.1.3 2.4.5 3.7.5 5.5 0 10-3.8 10-8.4S17.5 3 12 3z"/></svg>`;
}

/** Khoảng cách nút mở chat tới mép (px). Chỉ nhận số hữu hạn, clamp 0..200; thiếu/sai ⇒ mặc định 20. */
function offsetPx(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(200, Math.max(0, Math.round(v))) : DEFAULT_OFFSET;
}

/**
 * Vòng viền quanh badge unread: trước đây cứng `#fff` — trên trang nền tối (hoặc widget chạy chế độ tối)
 * nó thành vành trắng lạc lõng. 'light'/'dark' ép cứng; 'auto' lấy #fff rồi để `prefers-color-scheme` của
 * hệ điều hành đổi sang nền tối.
 */
function badgeRingCss(scheme: 'auto' | 'light' | 'dark'): string {
  const ring = (c: string) => `box-shadow:0 0 0 2px ${c}`;
  if (scheme === 'dark') return `.lc-badge{${ring(DARK_RING)}}`;
  if (scheme === 'light') return `.lc-badge{${ring('#fff')}}`;
  return `.lc-badge{${ring('#fff')}}
@media (prefers-color-scheme: dark){.lc-badge{${ring(DARK_RING)}}}`;
}

function shadowCss(
  primary = '#1677ff',
  left = false,
  onPrimary = '#fff',
  primaryStrongColor = primary,
  scheme: 'auto' | 'light' | 'dark' = 'auto',
  offsetX = DEFAULT_OFFSET,
  offsetY = DEFAULT_OFFSET,
): string {
  const side = left ? `left:${offsetX}px;` : `right:${offsetX}px;`;
  const frameSide = side;
  // story-08 AC5: khung "nở ra" từ đúng góc đặt bubble (dưới-trái hoặc dưới-phải).
  const frameOrigin = left ? '0% 100%' : '100% 100%';
  return `
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.lc-launcher{position:fixed;bottom:calc(${offsetY}px + env(safe-area-inset-bottom,0px));${side}height:56px;min-width:56px;padding:0 20px 0 16px;border-radius:28px;border:none;
  cursor:pointer;background:${primaryStrongColor};color:${onPrimary};display:flex;align-items:center;justify-content:center;gap:8px;
  font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;white-space:nowrap;
  box-shadow:0 4px 14px rgba(0,0,0,.18),0 2px 4px rgba(0,0,0,.12);transition:transform .15s ease, box-shadow .15s ease}
.lc-launcher .lc-ic{width:22px;height:22px;flex:0 0 auto}
/* Vòng focus: viền trong dùng màu chữ trên nút (tương phản với NỀN NÚT), viền ngoài dùng chính màu nút —
   nút nổi trên trang khách nền tuỳ ý, chỉ 1 vòng trắng thì mất hút trên trang nền sáng. */
.lc-launcher:focus-visible{outline:3px solid ${onPrimary};outline-offset:3px;
  box-shadow:0 4px 14px rgba(0,0,0,.18),0 2px 4px rgba(0,0,0,.12),0 0 0 6px ${primaryStrongColor}}
.lc-launcher:hover{transform:scale(1.06);box-shadow:0 6px 18px rgba(0,0,0,.22),0 3px 6px rgba(0,0,0,.16)}
.lc-launcher:active{transform:scale(.94)}
.lc-badge{position:absolute;top:-2px;${left ? 'left:-2px;' : 'right:-2px;'}min-width:20px;height:20px;padding:0 5px;border-radius:10px;
  background:#dc2626;color:#fff;font-size:12px;font-weight:700;line-height:20px;text-align:center}
${badgeRingCss(scheme)}
/* background TRANSPARENT (v1.3.0): nền trắng cứng ở đây nháy trắng 1 nhịp trước khi iframe vẽ xong — rõ
   nhất ở chế độ tối. Nền thật do chính app trong iframe vẽ (--lc-bg). */
.lc-frame-wrap{position:fixed;bottom:${offsetY}px;${frameSide}width:350px;height:550px;
  max-height:calc(100vh - ${offsetY * 2}px);
  border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);background:transparent;
  opacity:0;transform:scale(.92);transform-origin:${frameOrigin};
  transition:opacity ${FRAME_ANIM_MS}ms ease, transform ${FRAME_ANIM_MS}ms ease, width .15s ease, height .15s ease}
/* story-08 AC5: .lc-in = trạng thái hiện. JS bỏ [hidden] → reflow → thêm .lc-in (mở); gỡ .lc-in rồi set
   [hidden] sau transitionend/timeout (đóng) — khung đóng phải display:none để không nuốt click trang khách. */
.lc-frame-wrap.lc-in{opacity:1;transform:scale(1)}
.lc-frame{width:100%;height:100%;border:0;display:block}
/* story B-05: compact-preview — bong bóng nhỏ nổi trên bubble, KHÔNG chiếm màn hình đầy đủ. height do JS
   set qua style inline (postMessage set_compact_view {height}) — thắng width/height ở trên nhờ specificity. */
/* Khung mở THAY CHỖ nút: nút ẩn HẲN khi mở (display:none), hiện lại khi đóng bằng X trên header/Escape —
   không chồng lên nhau tốn chỗ. Vì vậy KHÔNG có biến thể "nút thu về hình tròn" khi mở. */
.lc-launcher.lc-open{display:none}
/* compact-preview vẫn nổi PHÍA TRÊN nút (nút còn hiện vì widget chưa "mở") */
.lc-frame-wrap.lc-compact{bottom:${offsetY + 76}px;width:300px;max-height:70vh;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.22)}
@media (max-width:480px){
  .lc-frame-wrap{top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-height:none;border-radius:0}
  /* compact-preview vẫn phải là card nhỏ nổi trên mobile, không được luật full-screen ở trên đè lên */
  .lc-frame-wrap.lc-compact{top:auto!important;left:12px!important;right:12px!important;bottom:${offsetY + 76}px!important;
    width:auto!important;max-width:calc(100vw - 24px);height:auto!important;border-radius:14px!important}
}
/* story-08 AC5: tôn trọng cấu hình hệ điều hành — không animation, khung hiện/ẩn tức thì.
   JS cũng tự gọi finishHide() ngay trong chế độ này (transitionend sẽ không bao giờ bắn). */
@media (prefers-reduced-motion: reduce){
  .lc-launcher{transition:none}
  .lc-launcher:hover,.lc-launcher:active{transform:none}
  .lc-frame-wrap{transition:none;transform:none}
  .lc-frame-wrap.lc-in{transform:none}
}`;
}
