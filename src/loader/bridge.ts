// Cầu postMessage 2 chiều với iframe widget.html + phát CustomEvent public ra window.
// Đây là nơi DUY NHẤT gửi message xuống iframe (postToIframe) và nơi DUY NHẤT nhận message từ iframe.

import { WIDGET_CHANNEL, type IframeToLoader, type LoaderToIframe } from '../shared/protocol';
import type { LoaderState } from './state';
import type { PublicEventName } from './types';
import type { FrameController } from './frame';
import type { SessionController } from './session';
import type { CampaignsBridge } from './campaigns-bridge';

export type PostFn = (msg: LoaderToIframe) => void;
export type PublicEmit = (name: PublicEventName, detail?: unknown) => void;

/** story-08 AC4: CustomEvent public trên window. */
export const emit: PublicEmit = (name, detail) => {
  try {
    window.dispatchEvent(
      detail === undefined
        ? new CustomEvent(`cluvix-chat:${name}`)
        : new CustomEvent(`cluvix-chat:${name}`, { detail }),
    );
  } catch {
    /* trang khách có polyfill lạ ghi đè CustomEvent — không để vỡ widget */
  }
};

export function createPost(state: LoaderState): PostFn {
  return (msg: LoaderToIframe) => {
    if (state.iframe && state.iframeReady && state.iframe.contentWindow) {
      state.iframe.contentWindow.postMessage(msg, state.widgetOrigin);
    }
  };
}

export interface BridgeDeps {
  post: PostFn;
  frame: FrameController;
  session: SessionController;
  campaigns: CampaignsBridge;
}

export function installMessageBridge(state: LoaderState, { post, frame, session, campaigns }: BridgeDeps) {
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.origin !== state.widgetOrigin) return; // chỉ nhận từ iframe của mình
    const msg = ev.data as IframeToLoader;
    if (!msg || msg.channel !== WIDGET_CHANNEL) return;
    switch (msg.type) {
      case 'ready':
        state.iframeReady = true;
        frame.flushPendingFocus();
        if (state.session) session.postSession();
        else if (state.lastError) post({ channel: WIDGET_CHANNEL, type: 'session_error', disabled: state.lastError.disabled });
        // story B-05 (CRITICAL): KHÔNG tự ensureSession() ở đây. Iframe giờ mount ẨN ngay từ boot (không
        // chờ open()) — nếu handshake tự động mỗi khi iframe 'ready', MỌI page-load sẽ tạo conversation dù
        // visitor chưa hề mở chat (vi phạm rule "handshake chỉ khi mở chat"). Handshake CHỈ chạy khi iframe
        // chủ động xin qua message 'handshake' (mở bubble → open() gọi ensureSession(); click compact-preview
        // → app.ts tự post 'handshake' sau bước exit_compact_view/pre-chat).
        // isOpen có thể đã true ở đây (khôi phục trạng thái mở từ tab trước, mount() gọi open() trước khi
        // iframe kịp 'ready' → message 'opened' gốc bị rớt vì iframeReady lúc đó còn false) — gửi bù lại.
        if (state.isOpen) post({ channel: WIDGET_CHANNEL, type: 'opened' });
        // story B-04: iframe vừa mount → gửi ngay campaign list đã có (nếu fetch xong trước đó) + URL hiện
        // tại (force=true: đây là lần gửi ĐẦU cho iframe này dù URL chưa đổi kể từ lần gửi trước).
        if (state.campaigns.length) post({ channel: WIDGET_CHANNEL, type: 'campaigns', list: state.campaigns });
        campaigns.sendUrlIfChanged(location.href, true);
        break;
      case 'handshake':
        // Iframe xin (re)handshake: pre_chat (submit form) hoặc refresh JWT (undefined). Xoá session cũ để
        // handshake lại (JWT mới), giữ nguyên conversation qua visitor_token đã lưu.
        // story B-05: click compact-preview gọi 'handshake' trong khi widget đang ĐÓNG (isOpen=false) — mở
        // khung đầy đủ NGAY trước khi handshake chạy (tránh hiện pre-chat form trong khung nhỏ compact).
        if (!state.isOpen) frame.showFullFrame();
        state.session = null;
        void session.handshake(msg.pre_chat);
        break;
      case 'close':
        frame.close();
        break;
      case 'unread':
        if (!state.isOpen) {
          state.unread = msg.count;
          frame.renderBadge();
        }
        break;
      case 'campaign_ready':
        // Chỉ tín hiệu quan sát — B-05 tự xử lý toàn bộ luồng preview trong iframe (xem protocol.ts).
        break;
      case 'set_compact_view':
        frame.showCompactFrame(msg.height);
        break;
      case 'exit_compact_view':
        if (msg.reason === 'open') frame.showFullFrame();
        else frame.hideCompactFrame();
        break;
      case 'refetch_campaigns':
        void campaigns.load(true);
        break;
      case 'staff_message':
        // story-08 AC4: phát event public — CHỈ metadata (conversation_id + sent_at), KHÔNG nội dung tin.
        emit('message', { conversation_id: state.session?.conversation_id ?? 0, sent_at: msg.sent_at });
        break;
    }
  });
}
