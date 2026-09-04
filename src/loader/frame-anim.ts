// story-08 AC5: animation khung (scale+fade 180ms, transform-origin ở góc bubble).
// Khung phải rời khỏi luồng (`display:none` qua thuộc tính `hidden`) khi đóng — nếu chỉ để opacity:0 nó
// vẫn nuốt click của trang khách. Vì vậy: mở = bỏ hidden → reflow → thêm class .lc-in; đóng = bỏ .lc-in →
// đợi transitionend (fallback timeout) → set hidden.

import { FRAME_HIDE_FALLBACK_MS } from './constants';

export interface FrameAnim {
  show(): void;
  hide(): void;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** `onHidden` chạy SAU khi khung thực sự bị ẩn (dọn ghim visualViewport). */
export function createFrameAnim(frameWrap: HTMLDivElement, onHidden: () => void): FrameAnim {
  let hideTimer = 0;

  function show() {
    window.clearTimeout(hideTimer);
    frameWrap.hidden = false;
    // Ép reflow: không có bước này trình duyệt gộp "bỏ hidden" + "thêm class" thành 1 style pass ⇒ không animate.
    void frameWrap.offsetWidth;
    frameWrap.classList.add('lc-in');
  }

  function hide() {
    if (frameWrap.hidden) return;
    frameWrap.classList.remove('lc-in');
    window.clearTimeout(hideTimer);
    // reduced-motion: transitionend sẽ KHÔNG bao giờ bắn (CSS tắt transition) → ẩn ngay.
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
    onHidden();
  }

  frameWrap.addEventListener('transitionend', (ev) => {
    const te = ev as TransitionEvent;
    if (te.target !== frameWrap || te.propertyName !== 'transform') return;
    if (!frameWrap.classList.contains('lc-in')) finishHide();
  });

  return { show, hide };
}
