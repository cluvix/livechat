// "Session broker": mọi handshake POST /api/client/livechat/session đều chạy Ở LOADER (Origin = trang khách,
// điều kiện BẮT BUỘC để BE chấp nhận theo allowed_origins), cùng với lưu/đọc resume token và identity.

import { WIDGET_CHANNEL } from '../shared/protocol';
import { pickLocale } from '../shared/strings';
import { defaultThemeFor, type ClientEnvelope, type SessionData, type WidgetTheme } from '../shared/types';
import { normalizeIdentity } from './bootstrap';
import { LOG, SET_USER_THROTTLE_MS, TOKEN_TTL_MS } from './constants';
import { lsGet, lsRemove, lsSet, ssGet, ssRemove, ssSet } from './storage';
import type { LoaderState } from './state';
import type { PostFn } from './bridge';

export interface SessionDeps {
  post: PostFn;
  applyThemeToLauncher: (theme: WidgetTheme) => void;
}

export interface SessionController {
  ensureSession(): Promise<void>;
  handshake(preChat?: { name?: string; phone?: string }): Promise<void>;
  setUser(raw: unknown): void;
  postSession(): void;
}

// ── M5: visitor_token — site có pre-chat bật lưu ở sessionStorage (phiên tab; máy dùng chung không đọc
// lại hội thoại y tế của người trước qua resume token). Site KHÔNG pre-chat vẫn dùng localStorage (tiện
// resume qua nhiều phiên trình duyệt) nhưng có hạn 30 ngày, ghi kèm `ts`. Đọc: chưa biết site có pre-chat
// hay chưa (chạy TRƯỚC khi handshake trả config) nên thử sessionStorage trước, rồi localStorage (kèm
// check TTL); tương thích ngược đọc được cả giá trị cũ dạng chuỗi trần (trước bản vá này, không có `ts`).
function readLocalToken(key: string): string | null {
  const raw = lsGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: string; ts?: number };
    if (parsed && typeof parsed.token === 'string') {
      if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > TOKEN_TTL_MS) {
        lsRemove(key);
        return null;
      }
      return parsed.token;
    }
  } catch {
    return raw; // chuỗi trần cũ (trước bản vá) — chưa có ts, không tự xoá dữ liệu hợp lệ trước đó
  }
  return null;
}

export function readSavedToken(key: string): string | null {
  return ssGet(key) || readLocalToken(key);
}

export function writeToken(key: string, token: string, preChatEnabled: boolean) {
  if (preChatEnabled) {
    ssSet(key, token);
    lsRemove(key); // site vừa đổi sang bật pre-chat — dọn token cũ còn ở localStorage
  } else {
    lsSet(key, JSON.stringify({ token, ts: Date.now() }));
    ssRemove(key);
  }
}

export function createSession(state: LoaderState, deps: SessionDeps): SessionController {
  /** Gửi session kèm locale đã chốt (iframe không đọc được `<html lang>` của trang khách). */
  function postSession() {
    if (state.session) deps.post({ channel: WIDGET_CHANNEL, type: 'session', data: state.session, locale: state.locale });
  }

  /** Áp config/theme trả về từ handshake vào state + nút mở chat. */
  function applySessionConfig(data: SessionData) {
    lsSet(state.keys.cfg, JSON.stringify(data.config || {}));
    const themeCfg = data.config?.widget_theme;
    // Locale của theme (nếu admin đặt) thắng — phải chốt TRƯỚC khi trộn default, vì greeting/offline
    // mặc định lấy theo locale. applyThemeToLauncher() ngay dưới cũng chốt lại đúng công thức này.
    const themeLocale = pickLocale({ themeLocale: themeCfg?.locale, htmlLang: state.htmlLang, navigatorLang: state.navLang });
    state.cachedTheme = themeCfg ? { ...defaultThemeFor(themeLocale), ...themeCfg } : defaultThemeFor(themeLocale);
    deps.applyThemeToLauncher(state.cachedTheme);
  }

  function buildHandshakeBody(preChat?: { name?: string; phone?: string }): Record<string, unknown> {
    const token = readSavedToken(state.keys.token) || undefined;
    const body: Record<string, unknown> = { site_key: state.siteKey };
    // story-08 AC2: có identity → gửi identity, KHÔNG gửi visitor_token. BE cũng bỏ qua token khi có
    // identity (arch §3.2 bước 4 — chống nhảy sang hội thoại ẩn danh bằng identity), loader không gửi
    // cho rõ ràng và để không lộ token ẩn danh vào request đã xác thực.
    if (state.identity) body.identity = state.identity;
    else if (token) body.visitor_token = token;
    if (preChat) body.pre_chat = preChat;
    return body;
  }

  async function handshake(preChat?: { name?: string; phone?: string }): Promise<void> {
    if (state.handshaking) return;
    state.handshaking = true;
    // story-08: identity có thể đổi NGAY TRONG LÚC request đang bay (setUser gọi giữa chừng) — ghi lại cái
    // đang dùng để cuối lượt tự handshake bù, tránh phiên "kẹt" ở identity cũ mà không ai kích lại.
    const usedIdentifier = state.identity ? state.identity.identifier : null;
    try {
      const res = await fetch(`${state.apiBase}/api/client/livechat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildHandshakeBody(preChat)),
      });
      const env = (await res.json()) as ClientEnvelope<SessionData>;
      if (!env || env.success !== true || !env.data || !env.data.visitor_jwt) {
        // 403 (site tắt/origin/không hợp lệ) → báo iframe hiển thị trạng thái không khả dụng.
        const disabled = !env || env.code === 403;
        state.lastError = { disabled };
        deps.post({ channel: WIDGET_CHANNEL, type: 'session_error', disabled });
        return;
      }
      state.lastError = null;
      state.session = env.data;
      // story-08: KHÔNG lưu visitor_token của phiên ĐÃ XÁC THỰC vào localStorage/sessionStorage — token đó
      // resume được hội thoại có danh tính; máy dùng chung / partner logout mà token còn nằm lại là rò hội
      // thoại. Phiên identity resume bằng chính identifier (BE tra `idv:` — arch §3.2 bước 4), không cần
      // token. M5(b): BE có thể trả visitor_token MỚI khác token đã gửi (vd site đổi chính sách) — luôn ghi
      // đè vô điều kiện, không so sánh với token cũ.
      if (!state.identity) {
        writeToken(state.keys.token, env.data.visitor_token, env.data.config?.pre_chat_form?.enabled === true);
      }
      applySessionConfig(env.data);
      postSession();
    } catch {
      state.lastError = { disabled: false };
      deps.post({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: false });
    } finally {
      state.handshaking = false;
    }
    // Identity đổi giữa lượt vừa rồi → phiên hiện tại không còn đúng người: handshake bù đúng 1 lần.
    if (state.session && (state.identity ? state.identity.identifier : null) !== usedIdentifier) {
      state.session = null;
      void handshake();
    }
  }

  async function ensureSession(): Promise<void> {
    if (state.session || state.handshaking) return;
    await handshake();
  }

  // ── story-08 AC3: public JS API (hợp đồng mở nguồn — arch §3.3) ──
  // Lệnh gọi TRƯỚC khi mount xong được xếp hàng và chạy ngay sau khi phát `ready` (trang khách nhúng async
  // nên rất dễ gọi cluvixChat.open() sớm hơn DOMContentLoaded).
  function setUser(raw: unknown) {
    const next = normalizeIdentity(raw);
    if (!next) {
      console.error(
        `${LOG} setUser: expected {identifier (1..128 chars), identifier_hash (64 hex)} — call ignored.`,
      );
      return;
    }
    // No-op khi identifier VÀ hash đều trùng cái đang áp — và handshake trước đó không lỗi. Nếu handshake
    // trước đó lỗi (lastError sau 403), setUser lặp lại (kể cả cùng identity, hash mới) phải kích lại, không
    // để widget kẹt offline vĩnh viễn.
    if (
      state.identity &&
      state.identity.identifier === next.identifier &&
      state.identity.identifier_hash === next.identifier_hash &&
      !state.lastError
    ) {
      return;
    }
    const now = Date.now();
    if (now - state.lastSetUserAt < SET_USER_THROTTLE_MS) {
      console.error(`${LOG} setUser ignored: called too often (at most once per ${SET_USER_THROTTLE_MS / 1000}s).`);
      return;
    }
    state.lastSetUserAt = now;
    state.identity = next;
    // Đã có phiên (ẩn danh hoặc identity khác), đã lỗi handshake trước đó, hoặc widget đang mở → re-handshake
    // ngay: BE trả conversation_id khác, loader gửi `session` mới vào iframe, iframe nạp lại lịch sử theo
    // đúng đường requestHandshake hiện có.
    if (state.session || state.lastError || state.isOpen) {
      state.session = null;
      void handshake();
    }
  }

  return { ensureSession, handshake, setUser, postSession };
}
