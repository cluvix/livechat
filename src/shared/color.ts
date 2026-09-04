// Toán màu dùng CHUNG cho 2 bundle (loader widget.js + app widget.html): chọn màu chữ trên nền
// `primary_color` do admin đặt và tự làm tối primary khi cần, để mọi tổ hợp đều đạt WCAG 2.1 AA (4.5:1)
// cho chữ thường.
//
// ⚠ Trước đây ui.ts dùng công thức YIQ (0.299R+0.587G+0.114B) với ngưỡng 0.55 — đó là công thức độ sáng
// video analog, KHÔNG phải luminance của WCAG: nó đánh giá SAI nhóm màu bão hoà (xanh dương/xanh lá) và
// cho ra chữ trắng trên nền chỉ đạt ~2.3:1. Ở đây dùng đúng định nghĩa WCAG: linearize sRGB rồi
// L = 0.2126R + 0.7152G + 0.0722B, contrast = (L1+0.05)/(L2+0.05).

/** Chữ tối dùng khi nền sáng (khớp `color:#111827` của body app). */
export const DARK_TEXT = '#111827';
export const LIGHT_TEXT = '#fff';

/** Ngưỡng WCAG 2.1 AA cho chữ thường. */
export const AA_CONTRAST = 4.5;

// Mỗi bước làm tối 1% (nhân 0.99). Trần 50 bước ⇒ tối đa còn ~60% độ sáng gốc: quá mức đó thì màu
// thương hiệu không còn nhận ra được, nên với các primary rất sáng (vàng, xám nhạt) ta GIỮ NGUYÊN màu và
// dùng chữ tối thay vì bóp méo thương hiệu.
const DARKEN_STEP = 0.99;
const MAX_DARKEN_STEPS = 50;

export type Rgb = [number, number, number];

/** Nhận `#rgb` / `#rrggbb` (có hoặc không có `#`). Sai định dạng → null (gọi bên ngoài tự fallback). */
export function hexToRgb(hex: string): Rgb | null {
  let s = (hex || '').trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Relative luminance theo WCAG 2.1 (sRGB linearize + hệ số 0.2126/0.7152/0.0722). */
export function relativeLuminance(rgb: Rgb): number {
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Tỉ lệ tương phản giữa 2 màu hex (1..21). Màu sai định dạng → 1 (coi như không tương phản). */
export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Màu chữ đặt TRÊN nền `hex`: chọn bên nào có contrast cao hơn (trắng vs #111827). */
export function onPrimaryColor(hex: string): string {
  if (!hexToRgb(hex)) return LIGHT_TEXT;
  return contrastRatio(LIGHT_TEXT, hex) >= contrastRatio(DARK_TEXT, hex) ? LIGHT_TEXT : DARK_TEXT;
}

/**
 * Biến thể ĐẬM hơn của primary, dùng làm nền cho mọi bề mặt có chữ (header, bubble của khách, nút gửi,
 * nút chính, avatar fallback, launcher).
 *
 * - Chữ trắng trên màu gốc đã đạt ≥4.5:1 → giữ nguyên màu gốc.
 * - Chưa đạt → làm tối dần 1%/bước tới khi chữ trắng đạt 4.5:1 (tối đa 50 bước).
 * - Không đạt nổi trong 50 bước (primary quá sáng: vàng, xám nhạt) → GIỮ màu gốc; lúc đó
 *   `onPrimaryColor(primaryStrong(hex))` tự chọn chữ tối #111827, vẫn đạt AA mà không phá màu thương hiệu.
 */
export function primaryStrong(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const base = rgbToHex(rgb); // chuẩn hoá (#rgb → #rrggbb) để so sánh/serialize nhất quán
  if (contrastRatio(LIGHT_TEXT, base) >= AA_CONTRAST) return base;
  let factor = 1;
  for (let i = 0; i < MAX_DARKEN_STEPS; i++) {
    factor *= DARKEN_STEP;
    const candidate = rgbToHex([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]);
    if (contrastRatio(LIGHT_TEXT, candidate) >= AA_CONTRAST) return candidate;
  }
  return base; // quá sáng để làm tối hợp lý → giữ gốc, chữ sẽ là #111827
}

/** Nền mờ 12% của primary (viền focus, highlight nhẹ). */
export function primarySoft(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'rgba(22,119,255,.12)';
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.12)`;
}
