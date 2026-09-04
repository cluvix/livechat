// story B-05 — bong bóng compact-preview của proactive campaign (không phải khung chat đầy đủ).
import type { Dict } from '../../shared/strings';
import type { CampaignPreview } from '../../shared/types';
import { wireImageFallbacks } from './brand';
import { escapeAttr, escapeText, safeHttpsUrl, xIcon } from './markup';
import type { CampaignPreviewCallbacks } from './types';

/** story B-05 (AC1/AC2) — bong bóng preview nhỏ (message + sender), KHÔNG mở full chat. Trả về chiều cao
 * thật (px) của khối vừa render để caller (main.ts) xin loader resize iframe đúng khít (postMessage
 * set_compact_view). sender null → fallback avatar chữ cái đầu + tên site (OD-B5). */
export function showCampaignPreview(
  host: HTMLElement,
  s: Dict,
  campaign: CampaignPreview,
  siteFallbackName: string,
  cb: CampaignPreviewCallbacks,
): number {
  const name = (campaign.sender?.name || siteFallbackName || s.defaultBrand).trim() || s.defaultBrand;
  const avatarUrl = safeHttpsUrl(campaign.sender?.avatar); // chỉ https, cùng luật với logo_url (AC8)
  const avatarHtml = avatarUrl
    ? `<img class="lc-preview-avatar" src="${escapeAttr(avatarUrl)}" alt=""/>`
    : `<div class="lc-preview-avatar lc-preview-avatar-fallback">${escapeText(name.charAt(0).toUpperCase() || '?')}</div>`;
  // B-06: cả khối preview là <button> thật (bàn phím tab tới + Enter/Space kích được), KHÔNG chỉ là div
  // có onclick. aria-label gộp tên người gửi + nội dung, rút gọn 80 ký tự cho screen reader gọn.
  const previewLabel = `${name}: ${campaign.message}`;
  const previewLabelShort =
    previewLabel.length > 80 ? previewLabel.slice(0, 80).trimEnd() + '…' : previewLabel;
  host.innerHTML = `<div class="lc-preview">
      <button class="lc-preview-x" type="button" aria-label="${escapeAttr(s.close)}">${xIcon()}</button>
      <button class="lc-preview-body" type="button" aria-label="${escapeAttr(previewLabelShort)}">
        ${avatarHtml}
        <div class="lc-preview-text">
          <div class="lc-preview-name">${escapeText(name)}</div>
          <div class="lc-preview-msg">${escapeText(campaign.message)}</div>
        </div>
      </button></div>`;
  host.querySelector<HTMLButtonElement>('.lc-preview-x')!.addEventListener('click', (e) => {
    e.stopPropagation();
    cb.onDismiss();
  });
  host.querySelector<HTMLButtonElement>('.lc-preview-body')!.addEventListener('click', () => cb.onClick());
  wireImageFallbacks(host, name.charAt(0).toUpperCase() || '?'); // avatar campaign: chữ đầu TÊN người gửi
  const el = host.querySelector<HTMLElement>('.lc-preview')!;
  return el.getBoundingClientRect().height || 96;
}
