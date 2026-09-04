// Chuỗi tiếng Việt của widget UI — gom 1 chỗ (story-07 AC10, chuẩn bị `locale` v2.1). Mọi text hiển thị
// trong ui.ts PHẢI lấy từ đây, KHÔNG rải rác trong template string.
export const STRINGS = {
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
  // Footer bắt buộc (AC6) — HTML tĩnh, KHÔNG chứa dữ liệu động/config, an toàn để gán thẳng vào innerHTML.
  footerHtml:
    'Cung cấp bởi <a href="https://cluvixhealth.vn" target="_blank" rel="noopener noreferrer">CluvixHealth</a>',
};
