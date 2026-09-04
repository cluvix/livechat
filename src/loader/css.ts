// CSS + asset inline của loader: toàn bộ style trong Shadow DOM của host, icon nút mở chat.
// Thuần hàm — không đọc/ghi state, không đụng DOM.

import { DARK_RING, DEFAULT_OFFSET, FRAME_ANIM_MS } from './constants';

// ── assets ──
export function chatIcon(): string {
  return `<svg class="lc-ic" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.3 1.1 4.3 2.9 5.8L4 21l4.3-1.6c1.1.3 2.4.5 3.7.5 5.5 0 10-3.8 10-8.4S17.5 3 12 3z"/></svg>`;
}

/** Khoảng cách nút mở chat tới mép (px). Chỉ nhận số hữu hạn, clamp 0..200; thiếu/sai ⇒ mặc định 20. */
export function offsetPx(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(200, Math.max(0, Math.round(v))) : DEFAULT_OFFSET;
}

/**
 * Vòng viền quanh badge unread: trước đây cứng `#fff` — trên trang nền tối (hoặc widget chạy chế độ tối)
 * nó thành vành trắng lạc lõng. 'light'/'dark' ép cứng; 'auto' lấy #fff rồi để `prefers-color-scheme` của
 * hệ điều hành đổi sang nền tối.
 */
export function badgeRingCss(scheme: 'auto' | 'light' | 'dark'): string {
  const ring = (c: string) => `box-shadow:0 0 0 2px ${c}`;
  if (scheme === 'dark') return `.lc-badge{${ring(DARK_RING)}}`;
  if (scheme === 'light') return `.lc-badge{${ring('#fff')}}`;
  return `.lc-badge{${ring('#fff')}}
@media (prefers-color-scheme: dark){.lc-badge{${ring(DARK_RING)}}}`;
}

export function shadowCss(
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
