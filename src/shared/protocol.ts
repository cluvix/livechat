// Giao thức postMessage loader ↔ iframe (AC2/AC4). MỌI message đều kèm channel cố định để lọc nhiễu
// (nhiều iframe/extension khác cũng postMessage). Origin check: 2 phía so origin chính domain widget mình
// (iframe.contentWindow.origin = origin nơi widget.html được serve = origin của loader script).
import type { CampaignPreview, SessionData } from './types';

export const WIDGET_CHANNEL = 'cluvix-livechat';

// iframe → loader
export type IframeToLoader =
  | { channel: typeof WIDGET_CHANNEL; type: 'ready' } // app iframe đã mount, sẵn sàng nhận session
  | { channel: typeof WIDGET_CHANNEL; type: 'handshake'; pre_chat?: { name?: string; phone?: string } } // xin (re)handshake — pre_chat khi submit form / undefined khi JWT hết hạn
  | { channel: typeof WIDGET_CHANNEL; type: 'close' } // user bấm đóng trong iframe
  | { channel: typeof WIDGET_CHANNEL; type: 'unread'; count: number } // số tin chưa đọc khi iframe đóng
  // story B-04: 1 campaign vừa "đến hạn" (time_on_page hết + URL còn khớp) — iframe chỉ PHÁT TÍN HIỆU,
  // KHÔNG tự tạo conversation/render UI. Giữ lại cho khả năng quan sát/debug; B-05 tự xử lý toàn bộ luồng
  // compact-preview trong iframe (đã có sẵn campaign object từ CampaignMatcher, không cần loader tra lại).
  | { channel: typeof WIDGET_CHANNEL; type: 'campaign_ready'; campaignId: number }
  // story B-05 (OD-B4): iframe xin loader resize iframe nhỏ để hiện compact-preview (message + sender + nút
  // X), KHÔNG mở full chat, KHÔNG tạo conversation. Loader sở hữu Shadow DOM host nên loader thực thi resize;
  // isOpen ở loader vẫn false (không phải "mở chat thật").
  | { channel: typeof WIDGET_CHANNEL; type: 'set_compact_view'; height: number }
  // story B-05: thoát compact view. reason='open' (visitor bấm vào message preview → sắp mở full chat +
  // handshake) → loader chuyển ngay sang khung đầy đủ (isOpen=true) TRƯỚC khi handshake chạy (tránh flash
  // pre-chat form trong khung nhỏ). reason='dismiss'/undefined (bấm X) → widget vẫn đóng, loader ẩn khung.
  | { channel: typeof WIDGET_CHANNEL; type: 'exit_compact_view'; reason?: 'open' | 'dismiss' }
  // story B-05 (AC3): xin loader fetch lại campaign list BỎ CACHE (double-check campaign còn `enabled`
  // ngay trước khi hiện preview — chống hiện campaign admin vừa tắt). Loader trả lại qua message 'campaigns'
  // như thường (không cần message riêng).
  | { channel: typeof WIDGET_CHANNEL; type: 'refetch_campaigns' };

// loader → iframe
export type LoaderToIframe =
  | { channel: typeof WIDGET_CHANNEL; type: 'session'; data: SessionData } // kết quả handshake (thành công)
  | { channel: typeof WIDGET_CHANNEL; type: 'session_error'; disabled: boolean } // handshake 403/l ỗi; disabled=true khi site tắt/không hợp lệ
  | { channel: typeof WIDGET_CHANNEL; type: 'opened' } // iframe được mở (reset unread)
  | { channel: typeof WIDGET_CHANNEL; type: 'closed' } // iframe bị đóng từ ngoài
  // story B-04: danh sách campaign `enabled` của site (loader fetch site_key, KHÔNG cần JWT — B-02), gửi
  // lại mỗi khi có list mới (fetch fresh hoặc cache-hit) để iframe tính lại theo URL hiện tại.
  | { channel: typeof WIDGET_CHANNEL; type: 'campaigns'; list: CampaignPreview[] }
  // story B-04: location.href site khách vừa đổi (kể cả SPA không reload) — iframe clear hết timer cũ
  // rồi filter+đặt lại timer theo URL mới.
  | { channel: typeof WIDGET_CHANNEL; type: 'url_changed'; url: string };
