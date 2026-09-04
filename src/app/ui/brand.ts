// Thương hiệu + khung header/footer: tên/chữ cái đầu/logo, fallback runtime khi ảnh lỗi tải, markup header
// (logo + tên + chấm trạng thái + nút đóng + dòng identity) và footer bắt buộc.
// Hàm THUẦN: nhận `theme`/`strings` qua tham số, không `this`, không giữ trạng thái.
import type { Dict } from '../../shared/strings';
import type { WidgetTheme } from '../../shared/types';
import { escapeAttr, escapeText, safeHttpsUrl, xIcon } from './markup';

export function brandName(theme: WidgetTheme, s: Dict): string {
  return (theme.brand_name || theme.launcher_label || '').trim() || s.defaultBrand;
}

function safeLogoUrl(theme: WidgetTheme): string | null {
  return safeHttpsUrl(theme.logo_url);
}

/** Chữ cái đầu thương hiệu — dùng cho cả markup fallback lẫn fallback runtime khi ảnh lỗi tải. */
export function brandInitial(theme: WidgetTheme, s: Dict): string {
  return brandName(theme, s).charAt(0).toUpperCase() || '?';
}

export function logoFallbackCls(solid: boolean): string {
  return solid ? 'lc-logo lc-logo-fallback-solid' : 'lc-logo lc-logo-fallback';
}

export function logoHtml(theme: WidgetTheme, s: Dict, size: number, solidFallback: boolean): string {
  const url = safeLogoUrl(theme);
  const style = `width:${size}px;height:${size}px`;
  // data-lc-fb ghi lại kiểu fallback ĐÚNG NGỮ CẢNH (header nằm trên nền primary ⇒ nền mờ trắng; các chỗ
  // khác ⇒ nền primary đặc) để listener 'error' dựng lại đúng khối khi URL logo hỏng.
  if (url) {
    return `<img class="lc-logo" style="${style}" src="${escapeAttr(url)}" alt="" data-lc-fb="${solidFallback ? 'solid' : 'soft'}"/>`;
  }
  return `<div class="${logoFallbackCls(solidFallback)}" style="${style}">${escapeText(brandInitial(theme, s))}</div>`;
}

/**
 * Logo hỏng (404, hotlink bị chặn, ảnh lỗi) → thay bằng khối chữ cái đầu CÙNG KÍCH THƯỚC, thay vì để lại
 * ô ảnh vỡ. Gắn sau MỖI lần render có `<img class="lc-logo">` (header/pre-chat/avatar nhóm) và cho cả
 * avatar campaign (.lc-preview-avatar). `{once:true}`: 1 ảnh chỉ thay 1 lần.
 */
export function wireImageFallbacks(scope: ParentNode, initial: string) {
  scope.querySelectorAll<HTMLImageElement>('img.lc-logo,img.lc-preview-avatar').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const div = document.createElement('div');
        if (img.classList.contains('lc-preview-avatar')) {
          div.className = 'lc-preview-avatar lc-preview-avatar-fallback';
        } else {
          div.className = logoFallbackCls(img.dataset.lcFb !== 'soft');
          // giữ nguyên class bổ sung do nơi gọi thêm vào (vd .lc-group-avatar cho avatar 24px)
          if (img.classList.contains('lc-group-avatar')) div.classList.add('lc-group-avatar');
        }
        div.style.cssText = img.style.cssText; // cùng width/height với ảnh vừa hỏng
        div.textContent = initial;
        img.replaceWith(div);
      },
      { once: true },
    );
  });
}

/** Avatar 24px cạnh nhóm tin của staff — dựng từ chính markup logo (đã escape ở logoHtml). */
export function avatarEl(theme: WidgetTheme, s: Dict): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = logoHtml(theme, s, 24, true); // markup tự sinh (đã escape ở logoHtml) — an toàn gán innerHTML
  const el = wrap.firstElementChild as HTMLElement;
  el.classList.add('lc-group-avatar');
  wireImageFallbacks(wrap, brandInitial(theme, s));
  return el;
}

export function header(theme: WidgetTheme, s: Dict, connected: boolean, identityDisplayName: string): string {
  const brand = brandName(theme, s);
  const subtitleRaw = (theme.subtitle || '').trim();
  const subtitle = subtitleRaw || (connected ? s.statusOnline : s.statusOffline);
  const dotCls = connected ? 'lc-dot lc-dot-on' : 'lc-dot';
  const identity = identityDisplayName
    ? `<div class="lc-identity">${escapeText(s.identifiedAs(identityDisplayName))}</div>`
    : '';
  return `<div class="lc-header-wrap">
      <div class="lc-header">
        <div class="lc-header-brand">
          ${logoHtml(theme, s, 40, false)}
          <div class="lc-header-text">
            <h1${brand ? ` title="${escapeAttr(brand)}"` : ''}>${escapeText(brand)}</h1>
            <div class="lc-header-sub"${subtitle ? ` title="${escapeAttr(subtitle)}"` : ''}>
              <span class="${dotCls}"></span><span>${escapeText(subtitle)}</span></div>
          </div>
        </div>
        <button class="lc-x" type="button" aria-label="${escapeAttr(s.close)}">${xIcon()}</button>
      </div>
      ${identity}
    </div>`;
}

export function footer(s: Dict): string {
  // story-07 AC6 — bắt buộc, không có cờ tắt. footerHtml là HTML tĩnh (không biến), an toàn.
  return `<div class="lc-footer">${s.footerHtml}</div>`;
}
