// Proactive campaign matching (story B-04) — chạy TRONG iframe. Nhận `campaigns` list + `url_changed` từ
// loader (protocol.ts) và quyết định "đến hạn" theo URLPattern + time_on_page 100% CLIENT (mirror
// Chatwoot campaignHelper — xem skill/bmad/omnichannel/review-chatwoot/07-widget-campaigns.md mục 6).
// Story này CHỈ tới điểm "đến hạn" (hook onDue) — KHÔNG tạo conversation, KHÔNG render UI (đó là B-05).
import type { CampaignPreview } from '../shared/types';

export type CampaignDueHandler = (campaign: CampaignPreview) => void;

export class CampaignMatcher {
  private list: CampaignPreview[] = [];
  private timers: number[] = [];
  private currentUrl = '';

  constructor(private readonly onDue: CampaignDueHandler) {}

  /** Danh sách mới từ loader (fetch fresh hoặc cache-hit) → tính lại theo URL hiện tại (nếu đã biết). */
  setCampaigns(list: CampaignPreview[]): void {
    this.list = Array.isArray(list) ? list : [];
    if (this.currentUrl) this.applyUrl(this.currentUrl);
  }

  /** URL site khách vừa đổi (AC1/AC4) — clear hết timer cũ, đặt lại theo URL mới. */
  urlChanged(url: string): void {
    this.applyUrl(url);
  }

  dispose(): void {
    this.clearTimers();
  }

  private applyUrl(url: string): void {
    this.currentUrl = url;
    this.clearTimers(); // AC3: mỗi lần đổi URL clear TẤT CẢ timer cũ trước khi filter lại
    if (!this.list.length) return;
    for (const campaign of this.list) {
      if (!matchesUrl(campaign.url_pattern, url)) continue;
      if (campaign.only_business_hours && !inBusinessHours()) continue;
      const ms = Math.max(0, (campaign.time_on_page || 0) * 1000);
      const handle = window.setTimeout(() => this.onDue(campaign), ms);
      this.timers.push(handle);
    }
  }

  private clearTimers(): void {
    for (const h of this.timers) window.clearTimeout(h);
    this.timers = [];
  }
}

// OD-B3 (v1, chốt trong architecture.md): widget CHƯA có nguồn working-hours thật (chỉ offline_text
// tĩnh) → bỏ qua filter giờ, luôn coi "trong giờ". Giữ hàm riêng để cắm business-hours thật sau này mà
// không đổi call site (applyUrl ở trên).
function inBusinessHours(): boolean {
  return true;
}

type UrlPatternLike = { test: (url: string) => boolean };
type UrlPatternCtor = new (pattern: string) => UrlPatternLike;

/**
 * Khớp URL theo `url_pattern` (BE validate bắt đầu http(s)://, có thể chứa wildcard `*`).
 * Ưu tiên `URLPattern` (Baseline browser API — Chromium/Safari 17.4+/Firefox 126+); KHÔNG thêm dep
 * `urlpattern-polyfill` để giữ widget nhẹ (Open Decision B-04: chọn feature-detect + glob fallback thay
 * vì polyfill — trình duyệt cũ hơn chỉ mất tính năng campaign, không ảnh hưởng chat lõi).
 * Trick trailing-slash (Chatwoot `campaignHelper.js:3-17`): pattern kết thúc "/" → nới thành khớp mọi
 * sub-path/query/hash bên dưới, tránh phải nhập đúng tuyệt đối "/pricing/" mới khớp "/pricing/plans".
 */
export function matchesUrl(pattern: string, url: string): boolean {
  if (!pattern) return false;
  let p = pattern.trim();
  if (p.endsWith('/')) p += '*';
  const Ctor = (globalThis as { URLPattern?: UrlPatternCtor }).URLPattern;
  if (Ctor) {
    try {
      return new Ctor(p).test(url);
    } catch {
      return fallbackGlobMatch(p, url);
    }
  }
  return fallbackGlobMatch(p, url);
}

/** Fallback khi URLPattern không sẵn: glob đơn giản trên toàn URL, "*" = mọi ký tự (kể cả rỗng). */
function fallbackGlobMatch(pattern: string, url: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp(`^${escaped}$`).test(url);
  } catch {
    return false;
  }
}
