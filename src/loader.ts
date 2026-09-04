// Cluvix Livechat — LOADER (widget.js). Chạy TRÊN TRANG KHÁCH (origin = website khách).
//
// KIẾN TRÚC (quan trọng — khác chữ AC3 nhưng BẮT BUỘC cho đúng bảo mật BE):
//   BE POST /api/client/livechat/session kiểm Origin ∈ allowed_origins (origin website khách). Chỉ
//   NGỮ CẢNH TRANG KHÁCH mới mang đúng Origin đó. Iframe widget.html serve từ domain Cluvix → Origin =
//   Cluvix ≠ allowed_origins → 403. Vì vậy TOÀN BỘ handshake /session chạy Ở LOADER (trang khách), rồi
//   trao visitor_jwt cho iframe qua postMessage. Iframe (cùng origin với /api) chỉ gọi message/messages/
//   typing/sse bằng JWT (các endpoint đó KHÔNG kiểm Origin, auth bằng JWT).
//
// Loader chịu trách nhiệm: bubble + iframe container (Shadow DOM cô lập CSS), là "session broker" (mọi
// handshake — mở đầu / pre-chat / refresh JWT hết hạn), unread badge, lưu visitor_token + trạng thái mở.
// KHÔNG analytics/cookie bên thứ 3; localStorage chỉ open state + cache config (AC) + visitor_token (site
// KHÔNG pre-chat, hết hạn 30 ngày — M5). Site CÓ pre-chat: visitor_token lưu sessionStorage (phiên tab —
// máy dùng chung không đọc lại hội thoại y tế của người trước qua resume token còn sót lại).
//
// story-08: loader còn là chủ của HỢP ĐỒNG MỞ NGUỒN với trang khách — `data-host` (tách origin backend khỏi
// origin phục vụ widget.js), `window.cluvixChat` (open/close/toggle/setUser/on/off) và CustomEvent
// `cluvix-chat:ready|opened|closed|message`. Identity (identifier + identifier_hash do SERVER partner ký)
// chỉ nằm TRONG BỘ NHỚ, KHÔNG localStorage. ⚠ KHÔNG BAO GIỜ đọc `identity_secret` từ DOM/JS: secret ở lại
// server partner, trang khách chỉ nhúng hash đã ký.
//
// v1.3.3: file này chỉ còn LẮP RÁP + thứ tự khởi tạo. Chi tiết nằm trong `src/loader/`:
//   bootstrap.ts (đọc data-attr) · state.ts (LoaderState — mọi biến thay đổi được) · storage.ts ·
//   css.ts (shadowCss/badge/icon) · frame.ts (Shadow DOM, launcher, khung, animation, viewport, badge) ·
//   session.ts (handshake broker, resume token, identity/setUser) · campaigns-bridge.ts (campaign + URL) ·
//   bridge.ts (postMessage 2 chiều + CustomEvent) · api.ts (window.cluvixChat + hàng đợi).

import { readBootstrap } from './loader/bootstrap';
import { createState } from './loader/state';
import { createPost, emit, installMessageBridge } from './loader/bridge';
import { createFrame } from './loader/frame';
import { createSession, type SessionController } from './loader/session';
import { createCampaignsBridge } from './loader/campaigns-bridge';
import { createApi } from './loader/api';
import { lsGet } from './loader/storage';
import type { Bootstrap } from './loader/types';

const boot = readBootstrap();
if (boot) start(boot);

function start(bootstrap: Bootstrap) {
  const state = createState(bootstrap);
  const post = createPost(state);

  // Thứ tự lắp ráp có ý nghĩa: frame dựng DOM + listener nút/Escape; session cần applyThemeToLauncher của
  // frame; bridge cần cả ba; API phải gắn lên window TRƯỚC khi kích mount (script nhúng async có thể chạy
  // sau DOMContentLoaded ⇒ mount() và event `ready` bắn NGAY).
  let sessionCtl: SessionController | null = null;
  const frame = createFrame(state, {
    post,
    emit,
    ensureSession: () => void sessionCtl?.ensureSession(),
  });
  const session = createSession(state, { post, applyThemeToLauncher: frame.applyThemeToLauncher });
  sessionCtl = session;
  const campaigns = createCampaignsBridge(state, post);
  installMessageBridge(state, { post, frame, session, campaigns });

  window.cluvixChat = createApi(state, frame, session);

  function mount() {
    if (frame.host.isConnected) return;
    document.body.appendChild(frame.host);
    frame.applyThemeToLauncher(state.cachedTheme);
    campaigns.trackUrlChanges(); // story B-04 (AC1) — cần document.body cho MutationObserver fallback
    void campaigns.load(); // story B-04 (AC2) — độc lập handshake, chạy TRƯỚC khi visitor mở chat
    // story B-05 (CRITICAL): mount iframe NGAY, ẨN (frameWrap.hidden vẫn true) — để timer campaign
    // (CampaignMatcher trong iframe) chạy được ngay cả khi widget đang đóng. KHÔNG chờ open()/click.
    // Iframe 'ready' KHÔNG tự handshake (xem case 'ready' trong bridge.ts) nên việc mount sớm không tạo
    // conversation/handshake ngoài ý muốn.
    frame.ensureIframe();
    // story-08 AC3/AC4: mount xong → public API hết "xếp hàng", phát `ready` ĐÚNG 1 LẦN (mount() có guard
    // isConnected ở đầu nên không chạy 2 lần), rồi mới chạy các lệnh đã xếp hàng trước đó.
    state.mounted = true;
    emit('ready');
    const queued = state.pendingApiCalls.splice(0, state.pendingApiCalls.length);
    for (const fn of queued) fn();
    // Khôi phục trạng thái mở (nếu tab trước để mở) — chỉ auto-mở trên desktop để không chiếm màn mobile.
    if (lsGet(state.keys.open) === '1' && !frame.isMobile()) frame.open();
  }

  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
}
