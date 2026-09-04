// Nguyên liệu markup dùng chung: escape XSS, lọc URL ảnh, icon SVG tĩnh, builder ô nhập của pre-chat và
// nhúng CSS app. KHÔNG giữ trạng thái, KHÔNG biết gì về theme/locale — mọi text hiển thị do nơi gọi truyền
// vào (chuỗi luôn đến từ `shared/strings.ts`).
import { APP_CSS } from '../styles';

/**
 * `<style>` của app chỉ được nhúng MỘT LẦN vào <head>. resetForNewConversation() dựng lại WidgetUI mỗi lần
 * đổi hội thoại — trước v1.3.3 mỗi lần dựng lại append thêm một thẻ <style> y hệt, phình dần theo số lần
 * reset. Kiểm bằng id trên thẻ (không chỉ cờ module) để kể cả khi module bị nạp 2 lần vẫn chỉ có 1 thẻ.
 */
const APP_CSS_STYLE_ID = 'lc-app-css';

export function injectAppCss() {
  if (document.getElementById(APP_CSS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = APP_CSS_STYLE_ID;
  style.textContent = APP_CSS;
  document.head.appendChild(style);
}

export function field(id: string, label: string, type: string, ph: string, err: string, multiline = false): string {
  // a11y: ô nhập trỏ tới dòng lỗi qua aria-describedby (dòng lỗi LUÔN tồn tại — chỉ ẩn/hiện bằng
  // visibility, xem styles.ts) và mang aria-invalid khi sai; role="alert" để screen reader đọc lỗi.
  const attrs = `id="${id}" aria-describedby="${id}-err" aria-invalid="false"`;
  const control = multiline
    ? `<textarea ${attrs} rows="2" placeholder="${escapeAttr(ph)}"></textarea>`
    : `<input ${attrs} type="${type}" placeholder="${escapeAttr(ph)}" autocomplete="${type === 'tel' ? 'tel' : 'name'}"/>`;
  return `<div class="lc-field" id="${id}-field">
    <label for="${id}">${escapeText(label)}</label>
    ${control}
    <div class="lc-err" id="${id}-err" role="alert">${escapeText(err)}</div></div>`;
}

/** URL ảnh chỉ chấp nhận https (AC8) — dùng cho logo_url và avatar campaign. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

export function escapeText(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function xIcon(): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>`;
}
export function sendIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 20.5 22 12 3 3.5 3 10l13 2-13 2z"/></svg>`;
}
export function offlineIcon(): string {
  return `<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.3 1.1 4.3 2.9 5.8L4 21l4.3-1.6c1.1.3 2.4.5 3.7.5 5.5 0 10-3.8 10-8.4S17.5 3 12 3z"/></svg>`;
}
export function chatDots(): string {
  return `<div class="lc-typing" style="align-self:center;margin-top:0">${'<span></span>'.repeat(3)}</div>`;
}
