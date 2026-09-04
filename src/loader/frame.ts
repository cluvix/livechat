// Hành vi của phần "thấy được" trên trang khách: mở/đóng khung, compact-preview, focus, badge unread và
// áp theme lên nút. Cây DOM ở frame-dom.ts, animation ở frame-anim.ts, ghim bàn phím ảo ở viewport.ts.

import { WIDGET_CHANNEL } from '../shared/protocol';
import type { WidgetTheme } from '../shared/types';
import { buildFrameDom } from './frame-dom';
import { applyThemeToLauncher, renderBadge as renderBadgeEl } from './theme';
import { createFrameAnim } from './frame-anim';
import { createViewportFit, isMobile } from './viewport';
import { lsSet } from './storage';
import type { LoaderState } from './state';
import type { PostFn, PublicEmit } from './bridge';

export interface FrameDeps {
  post: PostFn;
  emit: PublicEmit;
  /** Bảo đảm có session khi visitor mở chat thật (handshake broker nằm ở session.ts). */
  ensureSession: () => void;
}

export interface FrameController {
  readonly host: HTMLDivElement;
  open(): void;
  close(): void;
  showFullFrame(): void;
  showCompactFrame(height: number): void;
  hideCompactFrame(): void;
  ensureIframe(): void;
  /** Iframe vừa báo 'ready' → dùng nốt yêu cầu focus đã hẹn trước đó. */
  flushPendingFocus(): void;
  applyThemeToLauncher(theme: WidgetTheme): void;
  renderBadge(): void;
  isMobile(): boolean;
}

export function createFrame(state: LoaderState, deps: FrameDeps): FrameController {
  const dom = buildFrameDom(state);
  const { host, launcher, frameWrap, badgeEl } = dom;
  const viewport = createViewportFit(state, frameWrap);
  const anim = createFrameAnim(frameWrap, () => viewport.unbind());

  // ── mở / đóng ──
  // story B-05: tách phần "hiện khung đầy đủ" (showFullFrame) khỏi phần "đảm bảo có session" (ensureSession)
  // — click preview compact cần mở khung đầy đủ NGAY (trước cả khi biết có cần pre-chat form hay không),
  // nhưng handshake chỉ chạy khi iframe chủ động xin qua message 'handshake' (giữ đúng rule "handshake chỉ
  // khi mở chat thật", tránh 2 nơi cùng gọi handshake).
  function showFullFrame() {
    const wasOpen = state.isOpen;
    state.isOpen = true;
    lsSet(state.keys.open, '1');
    state.unread = 0;
    renderBadge();
    frameWrap.classList.remove('lc-compact');
    frameWrap.style.height = '';
    anim.show();
    if (isMobile()) viewport.bind();
    launcher.classList.add('lc-open');
    launcher.setAttribute('aria-expanded', 'true');
    ensureIframe();
    focusIframeWhenReady();
    deps.post({ channel: WIDGET_CHANNEL, type: 'opened' });
    if (!wasOpen) deps.emit('opened'); // AC4 — chỉ phát khi THỰC SỰ chuyển trạng thái
  }

  function open() {
    showFullFrame();
    // Bảo đảm có session (handshake nếu chưa) — mở bubble là thời điểm handshake (trước đó bubble dùng default/cache).
    deps.ensureSession();
  }

  function close() {
    const wasOpen = state.isOpen;
    state.isOpen = false;
    lsSet(state.keys.open, '0');
    anim.hide();
    launcher.classList.remove('lc-open');
    launcher.setAttribute('aria-expanded', 'false');
    deps.post({ channel: WIDGET_CHANNEL, type: 'closed' });
    // Trả focus về nút vừa mở khung — nếu không, focus rơi về <body> và người dùng bàn phím mất chỗ đứng.
    if (wasOpen) launcher.focus();
    if (wasOpen) deps.emit('closed'); // AC4
  }

  // ── story B-05: compact-preview (widget đóng, hiện bong bóng nhỏ mời chat) ──
  function showCompactFrame(height: number) {
    ensureIframe();
    viewport.unbind(); // compact tự set height riêng — không để ghim theo visualViewport đè lên
    frameWrap.classList.add('lc-compact');
    frameWrap.style.height = `${Math.max(60, Math.round(height))}px`;
    anim.show(); // story-08 AC5: dùng chung đường hiện khung (fade+scale) — compact vẫn giữ layout riêng
    // isOpen CỐ Ý giữ nguyên false — compact-preview không phải "mở chat thật" (không handshake).
  }

  function hideCompactFrame() {
    if (!state.isOpen) {
      anim.hide(); // finishHide() sẽ gỡ .lc-compact + height sau khi animation xong
      return;
    }
    frameWrap.classList.remove('lc-compact');
    viewport.clear();
    if (isMobile()) viewport.bind(); // quay lại khung đầy đủ đang mở → ghim lại theo visualViewport
  }

  // Focus vào iframe ngay khi mở (nội dung khung nằm trong document khác — không focus thì Tab tiếp theo
  // đi vào trang khách chứ không vào khung chat). Iframe có thể chưa 'ready' → hẹn lại ở case 'ready'.
  let focusFrameOnReady = false;

  function focusIframeWhenReady() {
    if (state.iframe && state.iframeReady) state.iframe.focus();
    else focusFrameOnReady = true;
  }

  function flushPendingFocus() {
    if (focusFrameOnReady && state.isOpen) {
      focusFrameOnReady = false;
      state.iframe?.focus();
    }
  }

  function ensureIframe() {
    if (state.iframe) return;
    const el = document.createElement('iframe');
    el.className = 'lc-frame';
    el.title = state.S.frameTitle;
    el.setAttribute('allow', 'clipboard-write');
    el.src = `${state.widgetOrigin}/widget.html?site_key=${encodeURIComponent(state.siteKey)}`;
    frameWrap.appendChild(el);
    state.iframe = el;
  }

  // ── theme + badge (chi tiết ở theme.ts) ──
  const applyTheme = (theme: WidgetTheme) => applyThemeToLauncher(state, dom, theme);
  const renderBadge = () => renderBadgeEl(state, badgeEl);

  launcher.addEventListener('click', () => (state.isOpen ? close() : open()));
  // Escape ở TRANG CHA đóng khung (iframe tự bắt Escape của nó rồi post 'close' — main.ts).
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.isOpen) close();
  });

  try {
    renderBadge();
  } catch {
    /* noop */
  }

  return {
    host,
    open,
    close,
    showFullFrame,
    showCompactFrame,
    hideCompactFrame,
    ensureIframe,
    flushPendingFocus,
    applyThemeToLauncher: applyTheme,
    renderBadge,
    isMobile,
  };
}
