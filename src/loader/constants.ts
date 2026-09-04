// Hằng số dùng chung cho loader (widget.js). Tách khỏi loader.ts để các module con dùng lại mà không tạo
// vòng import ngược về entry.

export const CAMPAIGNS_TTL_MS = 60 * 60 * 1000; // AC2: cache 1h theo siteKey
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // M5: token ẩn danh (site KHÔNG pre-chat) hết hạn sau 30 ngày
export const LOG = '[cluvix-livechat]';
export const SET_USER_THROTTLE_MS = 2000; // story-08: chặn re-handshake storm khi partner gọi setUser liên tục
export const FRAME_ANIM_MS = 180; // story-08 AC5 — phải khớp transition trong shadowCss()
export const FRAME_HIDE_FALLBACK_MS = 250; // dự phòng khi transitionend không bắn (tab ẩn, reduced-motion…)
export const DEFAULT_OFFSET = 20; // px — khoảng cách mặc định nút mở chat tới mép (theme.launcher_offset_x/y)
export const DARK_RING = '#161b22'; // = --lc-bg chế độ tối trong app/styles.ts (vòng viền badge trên nền tối)
