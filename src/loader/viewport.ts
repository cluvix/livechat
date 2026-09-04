// v1.3.0: bàn phím ảo iOS che ô soạn tin.
// Trên mobile khung chat là full-screen (top/bottom:0). Safari iOS KHÔNG thu nhỏ layout viewport khi bàn
// phím bật ⇒ nửa dưới khung (composer) nằm SAU bàn phím, gõ không thấy chữ. visualViewport cho biết
// phần thực sự nhìn thấy: ghim khung theo đúng vùng đó. Chỉ áp cho mobile + khung ĐANG mở đầy đủ —
// desktop và compact-preview giữ nguyên layout CSS.

import type { LoaderState } from './state';

export function isMobile(): boolean {
  return window.matchMedia('(max-width: 480px)').matches;
}

export interface ViewportFit {
  bind(): void;
  unbind(): void;
  /** Trả height/top/bottom về cho CSS mà KHÔNG gỡ listener (compact-preview tự set height riêng). */
  clear(): void;
}

export function createViewportFit(state: LoaderState, frameWrap: HTMLDivElement): ViewportFit {
  let vvBound = false;

  function clear() {
    frameWrap.style.height = '';
    frameWrap.style.top = '';
    frameWrap.style.bottom = '';
  }

  function sync() {
    const vv = window.visualViewport;
    if (!vv) return;
    if (!state.isOpen || !isMobile() || frameWrap.classList.contains('lc-compact')) {
      // Xoay ngang / đổi cỡ cửa sổ khiến không còn là mobile → trả lại layout CSS ngay.
      if (frameWrap.style.height || frameWrap.style.top) clear();
      return;
    }
    frameWrap.style.height = `${Math.round(vv.height)}px`;
    frameWrap.style.top = `${Math.round(vv.offsetTop)}px`;
    frameWrap.style.bottom = 'auto';
  }

  function bind() {
    const vv = window.visualViewport;
    if (!vv || vvBound) return;
    vvBound = true;
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
  }

  function unbind() {
    const vv = window.visualViewport;
    if (vv && vvBound) {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    }
    vvBound = false;
    clear();
  }

  return { bind, unbind, clear };
}
