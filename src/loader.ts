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
// KHÔNG analytics/cookie bên thứ 3; localStorage chỉ visitor_token + open state + cache config (AC).

import { WIDGET_CHANNEL, type IframeToLoader, type LoaderToIframe } from './shared/protocol';
import { DEFAULT_THEME, type SessionData, type WidgetTheme, type ClientEnvelope } from './shared/types';

interface Bootstrap {
  siteKey: string;
  apiBase: string; // origin backend (nơi widget.js được serve) — dùng cho fetch /session + iframe src
}

function readBootstrap(): Bootstrap | null {
  // document.currentScript chỉ có trong lúc script chạy đồng bộ; script nhúng async vẫn trỏ đúng tag.
  const el =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-site-key][src*="widget.js"]');
  if (!el) return null;
  const siteKey = (el.getAttribute('data-site-key') || '').trim();
  if (!siteKey) return null;
  let apiBase = '';
  try {
    apiBase = new URL(el.src).origin;
  } catch {
    apiBase = window.location.origin;
  }
  return { siteKey, apiBase };
}

const boot = readBootstrap();
if (boot) start(boot);

function start({ siteKey, apiBase }: Bootstrap) {
  const LS_TOKEN = `cluvix_lc_token_${siteKey}`;
  const LS_OPEN = `cluvix_lc_open_${siteKey}`;
  const LS_CFG = `cluvix_lc_cfg_${siteKey}`;
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

  // ── state ──
  let session: SessionData | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let iframeReady = false;
  let isOpen = false;
  let unread = 0;
  let handshaking = false;
  let lastError: { disabled: boolean } | null = null; // buffer lỗi handshake nếu iframe chưa 'ready'
  let cachedTheme: WidgetTheme = readCachedTheme();

  function readCachedTheme(): WidgetTheme {
    const raw = lsGet(LS_CFG);
    if (raw) {
      try {
        const cfg = JSON.parse(raw) as { widget_theme?: WidgetTheme | null };
        if (cfg.widget_theme) return { ...DEFAULT_THEME, ...cfg.widget_theme };
      } catch {
        /* ignore */
      }
    }
    return { ...DEFAULT_THEME };
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
  launcher.setAttribute('aria-label', 'Mở khung chat');
  launcher.innerHTML = `${chatIcon()}${closeIcon()}<span class="lc-badge" hidden></span>`;
  root.appendChild(launcher);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'lc-frame-wrap';
  frameWrap.hidden = true;
  root.appendChild(frameWrap);

  const badgeEl = launcher.querySelector<HTMLSpanElement>('.lc-badge')!;

  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();

  function mount() {
    if (host.isConnected) return;
    document.body.appendChild(host);
    applyThemeToLauncher(cachedTheme);
    // Khôi phục trạng thái mở (nếu tab trước để mở) — chỉ auto-mở trên desktop để không chiếm màn mobile.
    if (lsGet(LS_OPEN) === '1' && !isMobile()) open();
  }

  launcher.addEventListener('click', () => (isOpen ? close() : open()));

  // ── mở / đóng ──
  function open() {
    isOpen = true;
    lsSet(LS_OPEN, '1');
    unread = 0;
    renderBadge();
    frameWrap.hidden = false;
    launcher.classList.add('lc-open');
    ensureIframe();
    // Bảo đảm có session (handshake nếu chưa) — mở là thời điểm handshake (trước đó bubble dùng default/cache).
    void ensureSession();
    postToIframe({ channel: WIDGET_CHANNEL, type: 'opened' });
  }

  function close() {
    isOpen = false;
    lsSet(LS_OPEN, '0');
    frameWrap.hidden = true;
    launcher.classList.remove('lc-open');
    postToIframe({ channel: WIDGET_CHANNEL, type: 'closed' });
  }

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.className = 'lc-frame';
    iframe.title = 'Khung trò chuyện';
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
    try {
      const token = lsGet(LS_TOKEN) || undefined;
      const body: Record<string, unknown> = { site_key: siteKey };
      if (token) body.visitor_token = token;
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
      lsSet(LS_TOKEN, session.visitor_token);
      lsSet(LS_CFG, JSON.stringify(session.config || {}));
      cachedTheme = session.config?.widget_theme
        ? { ...DEFAULT_THEME, ...session.config.widget_theme }
        : { ...DEFAULT_THEME };
      applyThemeToLauncher(cachedTheme);
      postToIframe({ channel: WIDGET_CHANNEL, type: 'session', data: session });
    } catch {
      lastError = { disabled: false };
      postToIframe({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: false });
    } finally {
      handshaking = false;
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
        if (session) postToIframe({ channel: WIDGET_CHANNEL, type: 'session', data: session });
        else if (lastError) postToIframe({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: lastError.disabled });
        else void ensureSession();
        break;
      case 'handshake':
        // Iframe xin (re)handshake: pre_chat (submit form) hoặc refresh JWT (undefined). Xoá session cũ để
        // handshake lại (JWT mới), giữ nguyên conversation qua visitor_token đã lưu.
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
    }
  });

  function postToIframe(msg: LoaderToIframe) {
    if (iframe && iframeReady && iframe.contentWindow) {
      iframe.contentWindow.postMessage(msg, widgetOrigin);
    }
  }

  // ── theme + badge ──
  function applyThemeToLauncher(theme: WidgetTheme) {
    style.textContent = shadowCss(theme.primary_color, theme.position === 'left');
    const label = (theme.launcher_label || '').trim();
    launcher.setAttribute('aria-label', label || 'Mở khung chat');
    launcher.title = label || '';
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
}

// ── assets ──
function chatIcon(): string {
  return `<svg class="lc-ic" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.3 1.1 4.3 2.9 5.8L4 21l4.3-1.6c1.1.3 2.4.5 3.7.5 5.5 0 10-3.8 10-8.4S17.5 3 12 3z"/></svg>`;
}
function closeIcon(): string {
  return `<svg class="lc-ic lc-ic-x" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>`;
}

function shadowCss(primary = '#1677ff', left = false): string {
  const side = left ? 'left:20px;' : 'right:20px;';
  const frameSide = left ? 'left:20px;' : 'right:20px;';
  return `
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.lc-launcher{position:fixed;bottom:20px;${side}width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;
  background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s ease, box-shadow .15s ease;padding:0}
.lc-launcher:hover{transform:scale(1.06);box-shadow:0 8px 26px rgba(0,0,0,.32)}
.lc-launcher .lc-ic-x{display:none}
.lc-launcher.lc-open .lc-ic{display:none}
.lc-launcher.lc-open .lc-ic-x{display:block}
.lc-badge{position:absolute;top:-2px;${left ? 'left:-2px;' : 'right:-2px;'}min-width:20px;height:20px;padding:0 5px;border-radius:10px;
  background:#ff5722;color:#fff;font-size:12px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px #fff}
.lc-frame-wrap{position:fixed;bottom:92px;${frameSide}width:350px;height:550px;max-height:calc(100vh - 112px);
  border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);background:#fff}
.lc-frame{width:100%;height:100%;border:0;display:block}
@media (max-width:480px){
  .lc-frame-wrap{top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-height:none;border-radius:0}
  .lc-launcher.lc-open{display:none}
}`;
}
