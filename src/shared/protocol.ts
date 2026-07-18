// Giao thức postMessage loader ↔ iframe (AC2/AC4). MỌI message đều kèm channel cố định để lọc nhiễu
// (nhiều iframe/extension khác cũng postMessage). Origin check: 2 phía so origin chính domain widget mình
// (iframe.contentWindow.origin = origin nơi widget.html được serve = origin của loader script).
import type { SessionData } from './types';

export const WIDGET_CHANNEL = 'cluvix-livechat';

// iframe → loader
export type IframeToLoader =
  | { channel: typeof WIDGET_CHANNEL; type: 'ready' } // app iframe đã mount, sẵn sàng nhận session
  | { channel: typeof WIDGET_CHANNEL; type: 'handshake'; pre_chat?: { name?: string; phone?: string } } // xin (re)handshake — pre_chat khi submit form / undefined khi JWT hết hạn
  | { channel: typeof WIDGET_CHANNEL; type: 'close' } // user bấm đóng trong iframe
  | { channel: typeof WIDGET_CHANNEL; type: 'unread'; count: number }; // số tin chưa đọc khi iframe đóng

// loader → iframe
export type LoaderToIframe =
  | { channel: typeof WIDGET_CHANNEL; type: 'session'; data: SessionData } // kết quả handshake (thành công)
  | { channel: typeof WIDGET_CHANNEL; type: 'session_error'; disabled: boolean } // handshake 403/l ỗi; disabled=true khi site tắt/không hợp lệ
  | { channel: typeof WIDGET_CHANNEL; type: 'opened' } // iframe được mở (reset unread)
  | { channel: typeof WIDGET_CHANNEL; type: 'closed' }; // iframe bị đóng từ ngoài
