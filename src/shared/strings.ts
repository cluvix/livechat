// Chuỗi hiển thị của widget — DÙNG CHUNG cho 2 bundle (loader widget.js + app widget.html).
// Mọi text hiển thị PHẢI lấy từ DICTS, KHÔNG viết thẳng trong template/loader (kiểm bằng grep chuỗi
// tiếng Việt ngoài file này = 0).
//
// v2 hỗ trợ đúng 2 locale LTR: 'vi' (mặc định) và 'en'. Locale được chốt Ở LOADER (chỉ loader đọc được
// `<html lang>` của trang khách) rồi gửi xuống iframe kèm message `session` — xem pickLocale().

export type Locale = 'vi' | 'en';

export const LOCALES: Locale[] = ['vi', 'en'];
export const DEFAULT_LOCALE: Locale = 'vi';

export interface Dict {
  close: string;
  connecting: string;
  defaultBrand: string;
  offlineDefault: string;
  offlineGeneric: string;
  statusOnline: string;
  statusOffline: string;
  identifiedAs: (name: string) => string;
  submitPreChat: string;
  submitPreChatSending: string;
  nameLabel: string;
  namePlaceholder: string;
  nameError: string;
  phoneLabel: string;
  phonePlaceholder: string;
  phoneError: string;
  messageLabel: string;
  messagePlaceholder: string;
  messageError: string;
  composerPlaceholder: string;
  composerAriaLabel: string;
  sendAriaLabel: string;
  statusSending: string;
  statusFailed: string;
  statusSent: string;
  typingAriaLabel: string;
  /** Nhãn mặc định trên nút mở chat khi admin chưa đặt `widget_theme.launcher_label`. */
  launcherDefault: string;
  /** Động từ ghép với nhãn thành aria-label nút mở chat: "Mở khung chat: Tư vấn". */
  openChat: string;
  /** `title` của iframe (screen reader đọc khi vào frame). */
  frameTitle: string;
  /** Text mặc định của `widget_theme.greeting_text` khi site chưa cấu hình. */
  themeGreeting: string;
  /** Text mặc định của `widget_theme.offline_text` khi site chưa cấu hình. */
  themeOffline: string;
  /** Footer bắt buộc — HTML TĨNH, KHÔNG chứa dữ liệu động/config nên an toàn gán thẳng vào innerHTML. */
  footerHtml: string;
}

export const DICTS: Record<Locale, Dict> = {
  vi: {
    close: 'Đóng',
    connecting: 'Đang kết nối…',
    defaultBrand: 'Trò chuyện',
    offlineDefault: 'Hiện kênh trò chuyện không khả dụng.',
    offlineGeneric: 'Không kết nối được, vui lòng thử lại sau.',
    statusOnline: 'Đang hoạt động',
    statusOffline: 'Ngoại tuyến',
    identifiedAs: (name: string): string => `Bạn đang trò chuyện với tư cách ${name}`,
    submitPreChat: 'Gửi tin nhắn',
    submitPreChatSending: 'Đang kết nối…',
    nameLabel: 'Họ tên',
    namePlaceholder: 'Nhập họ tên',
    nameError: 'Vui lòng nhập họ tên.',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: 'Nhập số điện thoại',
    phoneError: 'Số điện thoại không hợp lệ.',
    messageLabel: 'Tin nhắn',
    messagePlaceholder: 'Nhập tin nhắn của bạn…',
    messageError: 'Vui lòng nhập tin nhắn.',
    composerPlaceholder: 'Nhập tin nhắn…',
    composerAriaLabel: 'Nhập tin nhắn',
    sendAriaLabel: 'Gửi',
    statusSending: 'Đang gửi…',
    statusFailed: 'Gửi lỗi · chạm để thử lại',
    statusSent: 'Đã gửi',
    typingAriaLabel: 'Nhân viên đang trả lời',
    launcherDefault: 'Tư vấn',
    openChat: 'Mở khung chat',
    frameTitle: 'Khung trò chuyện',
    themeGreeting: 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
    themeOffline: 'Hiện không có nhân viên trực tuyến, để lại tin nhắn nhé!',
    footerHtml:
      'Cung cấp bởi <a href="https://cluvixsolutions.com" target="_blank" rel="noopener noreferrer">CluvixHealth</a>',
  },
  en: {
    close: 'Close',
    connecting: 'Connecting…',
    defaultBrand: 'Chat',
    offlineDefault: 'This chat channel is currently unavailable.',
    offlineGeneric: 'Could not connect, please try again later.',
    statusOnline: 'Online',
    statusOffline: 'Offline',
    identifiedAs: (name: string): string => `You are chatting as ${name}`,
    submitPreChat: 'Send message',
    submitPreChatSending: 'Connecting…',
    nameLabel: 'Full name',
    namePlaceholder: 'Enter your name',
    nameError: 'Please enter your name.',
    phoneLabel: 'Phone number',
    phonePlaceholder: 'Enter your phone number',
    phoneError: 'Invalid phone number.',
    messageLabel: 'Message',
    messagePlaceholder: 'Type your message…',
    messageError: 'Please enter a message.',
    composerPlaceholder: 'Type a message…',
    composerAriaLabel: 'Type a message',
    sendAriaLabel: 'Send',
    statusSending: 'Sending…',
    statusFailed: 'Failed · tap to retry',
    statusSent: 'Sent',
    typingAriaLabel: 'Agent is typing',
    launcherDefault: 'Chat with us',
    openChat: 'Open chat',
    frameTitle: 'Chat window',
    themeGreeting: 'Hi there! How can we help you?',
    themeOffline: 'No agent is online right now — leave us a message!',
    footerHtml:
      'Powered by <a href="https://cluvixsolutions.com" target="_blank" rel="noopener noreferrer">CluvixHealth</a>',
  },
};

export function t(loc: Locale): Dict {
  return DICTS[loc] || DICTS[DEFAULT_LOCALE];
}

function normalize(raw: string | null | undefined): Locale | null {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  const base = v.split(/[-_]/)[0];
  return (LOCALES as string[]).includes(base) ? (base as Locale) : null;
}

/**
 * Thứ tự suy diễn locale: `widget_theme.locale` (admin chốt) → `<html lang>` của trang khách →
 * `navigator.language` → 'vi'. Mọi nguồn đều optional (BE cũ chưa gửi `locale`, trang khách có thể không
 * đặt `lang`) — thiếu hết thì rơi về mặc định.
 */
export function pickLocale(src: {
  themeLocale?: string | null;
  htmlLang?: string | null;
  navigatorLang?: string | null;
}): Locale {
  return (
    normalize(src.themeLocale) ?? normalize(src.htmlLang) ?? normalize(src.navigatorLang) ?? DEFAULT_LOCALE
  );
}
