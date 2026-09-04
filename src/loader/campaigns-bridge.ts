// story B-04: campaign list (fetch 1 lần, cache 1h) + theo dõi URL đổi (kể cả SPA không reload).
// Fetch ĐỘC LẬP handshake/session — campaign phải sẵn sàng TRƯỚC khi visitor mở chat. Loader (Origin
// trang khách) là nơi DUY NHẤT gọi được endpoint này (BE check Origin ∈ allowed_origins, mirror /session);
// iframe (Origin Cluvix) không tự fetch được nên loader gửi list qua postMessage.

import { WIDGET_CHANNEL } from '../shared/protocol';
import type { CampaignPreview, CampaignsData, ClientEnvelope } from '../shared/types';
import { CAMPAIGNS_TTL_MS } from './constants';
import { lsGet, lsSet } from './storage';
import type { LoaderState } from './state';
import type { PostFn } from './bridge';

export interface CampaignsBridge {
  /** story B-05 (AC3): `force=true` bỏ qua cache localStorage — dùng khi iframe xin refetch trước khi hiện
   * compact-preview (double-check campaign còn `enabled`, admin có thể vừa tắt). */
  load(force?: boolean): Promise<void>;
  sendUrlIfChanged(url: string, force?: boolean): void;
  /** Gắn listener theo dõi URL — cần document.body (MutationObserver fallback) nên gọi trong mount(). */
  trackUrlChanges(): void;
}

function readCachedCampaigns(key: string): CampaignPreview[] | null {
  const raw = lsGet(key);
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

export function createCampaignsBridge(state: LoaderState, post: PostFn): CampaignsBridge {
  async function load(force = false): Promise<void> {
    if (!force) {
      const cached = readCachedCampaigns(state.keys.campaigns);
      if (cached) {
        state.campaigns = cached;
        post({ channel: WIDGET_CHANNEL, type: 'campaigns', list: state.campaigns });
        return;
      }
    }
    try {
      const res = await fetch(
        `${state.apiBase}/api/client/livechat/campaigns?site_key=${encodeURIComponent(state.siteKey)}`,
      );
      const env = (await res.json()) as ClientEnvelope<CampaignsData>;
      if (!env || env.success !== true || !env.data || !Array.isArray(env.data.campaigns)) return; // site tắt/lỗi → im lặng, không phá trang khách
      state.campaigns = env.data.campaigns;
      lsSet(state.keys.campaigns, JSON.stringify({ ts: Date.now(), list: state.campaigns }));
      post({ channel: WIDGET_CHANNEL, type: 'campaigns', list: state.campaigns });
    } catch {
      /* lỗi mạng: bỏ qua — campaign là tính năng cộng thêm, không chặn chat lõi */
    }
  }

  function sendUrlIfChanged(url: string, force = false) {
    if (!force && url === state.lastSentUrl) return;
    state.lastSentUrl = url;
    post({ channel: WIDGET_CHANNEL, type: 'url_changed', url });
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

  return { load, sendUrlIfChanged, trackUrlChanges };
}
