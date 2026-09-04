// LoaderState: TOÀN BỘ biến thay đổi được của loader gom vào MỘT object truyền vào các module con —
// thay cho ~30 closure trong hàm start() cũ. Không module nào được giữ bản sao riêng của các field này.

import { pickLocale, t, type Dict, type Locale } from '../shared/strings';
import { defaultThemeFor, type CampaignPreview, type SessionData, type WidgetIdentity, type WidgetTheme } from '../shared/types';
import { lsGet } from './storage';
import type { Bootstrap } from './types';

export interface StorageKeys {
  token: string;
  open: string;
  cfg: string;
  campaigns: string;
}

export interface LoaderState {
  readonly siteKey: string;
  readonly apiBase: string;
  /** widget.html serve cùng domain backend (webhookBase); iframe.origin = apiBase */
  readonly widgetOrigin: string;
  readonly keys: StorageKeys;

  session: SessionData | null;
  iframe: HTMLIFrameElement | null;
  iframeReady: boolean;
  isOpen: boolean;
  unread: number;
  handshaking: boolean;
  /** buffer lỗi handshake nếu iframe chưa 'ready' */
  lastError: { disabled: boolean } | null;

  readonly htmlLang: string | null;
  readonly navLang: string | null;
  locale: Locale;
  cachedTheme: WidgetTheme;
  S: Dict;

  campaigns: CampaignPreview[]; // story B-04 (AC2) — buffer để gửi lại khi iframe 'ready' sau
  lastSentUrl: string | null; // story B-04 (AC1) — tránh gửi trùng url_changed khi không đổi
  // story-08: identity CHỈ trong memory (KHÔNG localStorage — hash là thông tin phiên của partner; reload
  // trang partner sẽ nhúng lại data-user-* hoặc gọi setUser()).
  identity: WidgetIdentity | null;
  lastSetUserAt: number;
  mounted: boolean;
  readonly pendingApiCalls: Array<() => void>; // lệnh public API gọi TRƯỚC khi mount xong → xếp hàng
}

function readCachedTheme(cfgKey: string, loc: Locale): WidgetTheme {
  const raw = lsGet(cfgKey);
  if (raw) {
    try {
      const cfg = JSON.parse(raw) as { widget_theme?: WidgetTheme | null };
      if (cfg.widget_theme) return { ...defaultThemeFor(loc), ...cfg.widget_theme };
    } catch {
      /* ignore */
    }
  }
  return defaultThemeFor(loc);
}

export function createState({ siteKey, apiBase, identity }: Bootstrap): LoaderState {
  const keys: StorageKeys = {
    token: `cluvix_lc_token_${siteKey}`,
    open: `cluvix_lc_open_${siteKey}`,
    cfg: `cluvix_lc_cfg_${siteKey}`,
    campaigns: `cluvix_lc_campaigns_${siteKey}`,
  };
  // Locale: `<html lang>` của TRANG KHÁCH chỉ đọc được ở đây (iframe khác origin) — loader chốt rồi gửi
  // xuống iframe kèm message `session`. Vòng 2 lượt vì `widget_theme.locale` (ưu tiên cao nhất) nằm trong
  // chính theme cache mà theme mặc định lại phụ thuộc locale.
  const htmlLang = document.documentElement.getAttribute('lang');
  const navLang = typeof navigator !== 'undefined' ? navigator.language : null;
  let locale: Locale = pickLocale({ htmlLang, navigatorLang: navLang });
  let cachedTheme: WidgetTheme = readCachedTheme(keys.cfg, locale);
  locale = pickLocale({ themeLocale: cachedTheme.locale, htmlLang, navigatorLang: navLang });
  cachedTheme = readCachedTheme(keys.cfg, locale);

  return {
    siteKey,
    apiBase,
    widgetOrigin: apiBase,
    keys,
    session: null,
    iframe: null,
    iframeReady: false,
    isOpen: false,
    unread: 0,
    handshaking: false,
    lastError: null,
    htmlLang,
    navLang,
    locale,
    cachedTheme,
    S: t(locale),
    campaigns: [],
    lastSentUrl: null,
    identity,
    lastSetUserAt: 0,
    mounted: false,
    pendingApiCalls: [],
  };
}
