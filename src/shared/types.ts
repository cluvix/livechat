// Shape khớp BE (story-07 config + story-17 session/message). KHÔNG đoán — trích từ handler thật:
//   backend/internal/modules/public/livechat/handler.go (Session, message, messages)
//   backend/internal/modules/webapp/config/omni_channel/handler/livechat.go (widgetTheme, preChatForm)
import { DICTS, DEFAULT_LOCALE, type Locale } from './strings';

/**
 * widget_theme — chốt story-07 AC3 (livechat.go widgetTheme). launcher_label optional.
 * `logo_url`/`brand_name`/`subtitle` — story-01 AC1 (widget-v2, `LogoURL`/`BrandName`/`Subtitle`
 * `omitempty` trong `widgetTheme`, architecture.md §3.1/§5); optional vì site cũ chưa cấu hình.
 */
export interface WidgetTheme {
  primary_color: string;
  position: 'left' | 'right';
  greeting_text: string;
  offline_text: string;
  launcher_label?: string;
  logo_url?: string;
  brand_name?: string;
  subtitle?: string;
  /** v1.2.0 — locale UI ('vi' | 'en'). Optional: BE cũ chưa gửi field này ⇒ loader tự suy diễn (pickLocale). */
  locale?: Locale;
  /**
   * v1.3.0 — chế độ sáng/tối. 'auto' (mặc định) = theo `prefers-color-scheme` của hệ điều hành khách;
   * 'light'/'dark' = ép cứng. Optional: BE cũ chưa gửi field này ⇒ coi như 'auto'.
   */
  color_scheme?: 'auto' | 'light' | 'dark';
  /**
   * v1.3.0 — khoảng cách nút mở chat tới mép màn hình, tính bằng px (x = mép trái/phải theo `position`,
   * y = mép dưới). Mặc định 20, clamp 0..200, chỉ nhận số hữu hạn. Optional: BE cũ chưa gửi ⇒ 20.
   */
  launcher_offset_x?: number;
  launcher_offset_y?: number;
}

/**
 * pre_chat_form — chốt story-07 AC3 (livechat.go preChatForm).
 * `require_message` — story-01 AC2 (`RequireMessage bool json:"require_message"`, default true).
 */
export interface PreChatForm {
  enabled: boolean;
  require_name: boolean;
  require_phone: boolean;
  require_message: boolean;
  /**
   * v1.2.0 — vùng số điện thoại chấp nhận ở pre-chat. 'VN' (mặc định) = số di động VN HOẶC E.164;
   * 'INTL' = chỉ E.164. Optional: BE cũ chưa gửi field này ⇒ coi như 'VN'.
   */
  phone_region?: 'VN' | 'INTL';
}

/** config trả trong POST /session (có thể null nếu site chưa cấu hình → fallback default). */
export interface SessionConfig {
  widget_theme: WidgetTheme | null;
  pre_chat_form: PreChatForm | null;
}

/**
 * data của POST /api/client/livechat/session (envelope .data).
 * `identity_verified`/`display_name` — architecture.md §3.2 (identity verification, HMAC), story-03/story-07
 * AC7: khi có, widget hiện "Bạn đang trò chuyện với tư cách {display_name}". Optional — session ẩn danh
 * (không gửi `identity` khi handshake) không có 2 field này.
 */
export interface SessionData {
  visitor_jwt: string;
  visitor_token: string;
  conversation_id: number;
  config: SessionConfig;
  identity_verified?: boolean;
  display_name?: string;
}

/**
 * Identity verification (story-08 AC2/AC3, architecture.md §3.2/§3.3).
 * `identifier` = định danh người dùng bên partner (1..128 ký tự, thường email/user id).
 * `identifier_hash` = hex(HMAC-SHA256(identity_secret, identifier)) — 64 hex, do SERVER của partner ký.
 * ⚠ `identity_secret` là secret phía server partner: KHÔNG BAO GIỜ đặt trong DOM/JS trang khách; loader chỉ
 * nhận hash đã ký sẵn và giữ identity TRONG BỘ NHỚ (không localStorage).
 */
export interface WidgetIdentity {
  identifier: string;
  identifier_hash: string;
  name?: string;
  phone?: string;
  email?: string;
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
 * GET /messages lẫn SSE new_message đều trả visitorMessageView (BE lược field nội bộ; client_echo_id
 * chỉ có ở tin của chính visitor, staff message không mang echo).
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

/**
 * Theme mặc định theo locale — greeting/offline lấy từ DICTS (KHÔNG hardcode ở đây nữa) để bản 'en'
 * không rơi về câu tiếng Việt khi site chưa cấu hình text riêng.
 */
export function defaultThemeFor(loc: Locale = DEFAULT_LOCALE): WidgetTheme {
  const d = DICTS[loc] || DICTS[DEFAULT_LOCALE];
  return {
    primary_color: '#1677ff',
    position: 'right',
    greeting_text: d.themeGreeting,
    offline_text: d.themeOffline,
    locale: loc,
  };
}

export const DEFAULT_PRECHAT: PreChatForm = {
  enabled: true,
  require_name: true,
  require_phone: true,
  require_message: true,
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
