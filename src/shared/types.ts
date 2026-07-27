// Shape khớp BE (story-07 config + story-17 session/message). KHÔNG đoán — trích từ handler thật:
//   backend/internal/modules/public/livechat/handler.go (Session, message, messages)
//   backend/internal/modules/webapp/config/omni_channel/handler/livechat.go (widgetTheme, preChatForm)

/** widget_theme — chốt story-07 AC3 (livechat.go widgetTheme). launcher_label optional. */
export interface WidgetTheme {
  primary_color: string;
  position: 'left' | 'right';
  greeting_text: string;
  offline_text: string;
  launcher_label?: string;
}

/** pre_chat_form — chốt story-07 AC3 (livechat.go preChatForm). */
export interface PreChatForm {
  enabled: boolean;
  require_name: boolean;
  require_phone: boolean;
}

/** config trả trong POST /session (có thể null nếu site chưa cấu hình → fallback default). */
export interface SessionConfig {
  widget_theme: WidgetTheme | null;
  pre_chat_form: PreChatForm | null;
}

/** data của POST /api/client/livechat/session (envelope .data). */
export interface SessionData {
  visitor_jwt: string;
  visitor_token: string;
  conversation_id: number;
  config: SessionConfig;
}

/** Envelope chuẩn client API (handler/helpers.go Success/Error/Validate). */
export interface ClientEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/**
 * OmiMessage như visitor thấy. src: 0 = visitor (SrcUser), 1 = staff (SrcStaff).
 * GET /messages trả full record; SSE new_message trả visitorMessageView (đã lược field nội bộ).
 * content có thể null (BE *string). sent_at = unix MILLIS.
 */
export interface WidgetMessage {
  id: number;
  conversation_id: number;
  client_echo_id?: string | null;
  src: number;
  msg_type: string;
  content: string | null;
  sent_at: number;
  created_at?: number;
}

export const SRC_VISITOR = 0;
export const SRC_STAFF = 1;
export const SRC_INTERNAL = 2; // note nội bộ — KHÔNG render cho visitor (phòng thủ; BE cũng đã chặn qua SSE).

export const DEFAULT_THEME: WidgetTheme = {
  primary_color: '#1677ff',
  position: 'right',
  greeting_text: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
  offline_text: 'Hiện không có nhân viên trực tuyến, để lại tin nhắn nhé!',
};

export const DEFAULT_PRECHAT: PreChatForm = {
  enabled: true,
  require_name: true,
  require_phone: true,
};

/** sender hiển thị kèm campaign — NULL khi sender_user_id NULL hoặc chưa có tên (OD-B5 v1, chốt ở B-02);
 *  FE tự fallback tên/avatar site khi null (B-05). */
export interface CampaignSender {
  name: string;
  avatar: string;
}

/**
 * Proactive campaign preview — trích từ `GET /api/client/livechat/campaigns?site_key=` (story B-02,
 * `backend/internal/modules/public/livechat/handler.go` `ListCampaigns`, KHÔNG VisitorAuth). Chỉ campaign
 * `enabled`. Widget matching (URL pattern + time-on-page) chạy 100% client (story B-04).
 */
export interface CampaignPreview {
  id: number;
  url_pattern: string;
  time_on_page: number; // giây — đếm khi visitor Ở URL khớp pattern
  only_business_hours: boolean;
  message: string;
  sender: CampaignSender | null;
}

/** data của GET /api/client/livechat/campaigns (.data.campaigns). */
export interface CampaignsData {
  campaigns: CampaignPreview[];
}
