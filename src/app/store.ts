// State của iframe app. Iframe KHÔNG giữ visitor_token (loader giữ, trên origin khách) — chỉ giữ jwt +
// conversation_id + config nhận qua postMessage. LocalStorage của iframe (origin Cluvix) chỉ lưu cờ đã
// hoàn tất pre-chat (namespaced site_key) để không hỏi lại mỗi lần mở.
import { DEFAULT_PRECHAT, defaultThemeFor, type PreChatForm, type SessionData, type WidgetTheme } from '../shared/types';
import { DEFAULT_LOCALE, type Locale } from '../shared/strings';

export interface AppState {
  siteKey: string;
  jwt: string;
  conversationId: number;
  theme: WidgetTheme;
  preChat: PreChatForm;
  identityVerified: boolean; // story-07 AC7
  displayName: string;
  /** Locale UI — loader chốt (theme.locale → <html lang> trang khách → navigator) và gửi kèm `session`. */
  locale: Locale;
}

export const state: AppState = {
  siteKey: '',
  jwt: '',
  conversationId: 0,
  theme: defaultThemeFor(DEFAULT_LOCALE),
  preChat: { ...DEFAULT_PRECHAT },
  identityVerified: false,
  displayName: '',
  locale: DEFAULT_LOCALE,
};

export function applySession(data: SessionData) {
  state.jwt = data.visitor_jwt;
  state.conversationId = data.conversation_id;
  state.theme = data.config?.widget_theme
    ? { ...defaultThemeFor(state.locale), ...data.config.widget_theme }
    : defaultThemeFor(state.locale);
  state.preChat = data.config?.pre_chat_form ? { ...DEFAULT_PRECHAT, ...data.config.pre_chat_form } : { ...DEFAULT_PRECHAT };
  state.identityVerified = data.identity_verified === true;
  state.displayName = data.display_name || '';
}

function lsKey(): string {
  return `cluvix_lc_prechat_${state.siteKey}`;
}

export function preChatDone(): boolean {
  try {
    return window.localStorage.getItem(lsKey()) === '1';
  } catch {
    return false;
  }
}

export function markPreChatDone() {
  try {
    window.localStorage.setItem(lsKey(), '1');
  } catch {
    /* private mode */
  }
}
