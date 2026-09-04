// State của iframe app. Iframe KHÔNG giữ visitor_token (loader giữ, trên origin khách) — chỉ giữ jwt +
// conversation_id + config nhận qua postMessage. LocalStorage của iframe (origin Cluvix) chỉ lưu cờ đã
// hoàn tất pre-chat (namespaced site_key) để không hỏi lại mỗi lần mở.
import { DEFAULT_PRECHAT, DEFAULT_THEME, type PreChatForm, type SessionData, type WidgetTheme } from '../shared/types';

export interface AppState {
  siteKey: string;
  jwt: string;
  conversationId: number;
  theme: WidgetTheme;
  preChat: PreChatForm;
  identityVerified: boolean; // story-07 AC7
  displayName: string;
}

export const state: AppState = {
  siteKey: '',
  jwt: '',
  conversationId: 0,
  theme: { ...DEFAULT_THEME },
  preChat: { ...DEFAULT_PRECHAT },
  identityVerified: false,
  displayName: '',
};

export function applySession(data: SessionData) {
  state.jwt = data.visitor_jwt;
  state.conversationId = data.conversation_id;
  state.theme = data.config?.widget_theme ? { ...DEFAULT_THEME, ...data.config.widget_theme } : { ...DEFAULT_THEME };
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
