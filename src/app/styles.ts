// CSS app iframe (inline vào widget.html qua singlefile). Iframe là document riêng → không leak ra trang
// khách. Màu chủ đạo qua biến --lc-primary (set từ theme); --lc-primary-strong (nền của MỌI bề mặt có
// chữ) / --lc-on-primary / --lc-soft-* tính bằng contrast WCAG thật trong shared/color.ts, set ở
// ui.ts applyTheme(). KHÔNG hardcode `color:#fff` trên nền primary — primary sáng (vàng, xám nhạt) thì
// chữ phải là var(--lc-text). Gọn, không phụ thuộc framework.
//
// v1.3.0 — CHẾ ĐỘ TỐI: mọi màu trung tính đi qua token (--lc-bg/-surface/-surface-2/-text/-muted/-line/
// -in-bg/-danger/-danger-on). KHÔNG hardcode #fff/#111827/#fafafa nữa: bảng token được định nghĩa lại 2
// nơi — theo `prefers-color-scheme: dark` của hệ điều hành (trừ khi theme ép 'light') và theo
// `:root[data-lc-scheme="dark"]` (theme ép 'dark'; ui.ts applyTheme set dataset.lcScheme).
// ⚠ --lc-primary-soft KHÔNG được set thẳng từ JS: applyTheme set --lc-soft-12/--lc-soft-28 (inline style
// LUÔN thắng rule stylesheet), còn việc chọn mức nào theo scheme thì để CSS quyết ở đây.
export const APP_CSS = `
:root{--lc-primary:#1677ff;--lc-primary-strong:#1570f0;--lc-on-primary:#fff;
  --lc-soft-12:rgba(22,119,255,.12);--lc-soft-28:rgba(22,119,255,.28);--lc-primary-soft:var(--lc-soft-12);
  --lc-bg:#fff;--lc-surface:#fafafa;--lc-surface-2:#f8fafc;--lc-text:#111827;
  --lc-muted:#565f6b;--lc-line:#e5e7eb;--lc-in-bg:#f1f3f5;--lc-danger:#c81e1e;--lc-danger-on:#fff;
  --lc-header-line:rgba(0,0,0,.08)}
/* Palette tối — muted #9198a1 đạt 6.5:1 trên --lc-surface và 5.94:1 trên --lc-bg (≥ AA 4.5:1, đo bằng
   shared/color.ts contrastRatio). */
@media (prefers-color-scheme: dark){
  :root:not([data-lc-scheme="light"]){--lc-bg:#161b22;--lc-surface:#0d1117;--lc-surface-2:#1c2129;
    --lc-text:#e6edf3;--lc-muted:#9198a1;--lc-line:#30363d;--lc-in-bg:#21262d;--lc-danger:#ff7b72;
    --lc-danger-on:#161b22;--lc-primary-soft:var(--lc-soft-28);--lc-header-line:rgba(255,255,255,.08)}
}
:root[data-lc-scheme="dark"]{--lc-bg:#161b22;--lc-surface:#0d1117;--lc-surface-2:#1c2129;
  --lc-text:#e6edf3;--lc-muted:#9198a1;--lc-line:#30363d;--lc-in-bg:#21262d;--lc-danger:#ff7b72;
  --lc-danger-on:#161b22;--lc-primary-soft:var(--lc-soft-28);--lc-header-line:rgba(255,255,255,.08)}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  background:var(--lc-bg);color:var(--lc-text);font-size:14px}
.lc-app{display:flex;flex-direction:column;height:100vh;height:100dvh}

/* ── header (story-07 AC2): logo + brand + subtitle/trạng thái + đóng ── */
.lc-header-wrap{flex:0 0 auto}
.lc-header{background:var(--lc-primary-strong,var(--lc-primary));color:var(--lc-on-primary);
  padding:calc(14px + env(safe-area-inset-top,0px)) 16px 14px;display:flex;
  align-items:center;justify-content:space-between;gap:10px;box-shadow:0 1px 0 var(--lc-header-line)}
.lc-header-brand{display:flex;align-items:center;gap:10px;min-width:0}
.lc-header-text{min-width:0}
.lc-header h1{margin:0;font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.lc-header-sub{display:flex;align-items:center;gap:5px;font-size:12px;opacity:.9;margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lc-dot{width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.55;flex:0 0 auto}
.lc-dot.lc-dot-on{background:#22c55e;opacity:1}
.lc-x{appearance:none;border:0;background:transparent;color:var(--lc-on-primary);cursor:pointer;padding:4px;
  border-radius:6px;display:flex;opacity:.9;flex:0 0 auto}
.lc-x:hover{opacity:1;background:rgba(0,0,0,.1)}
.lc-identity{padding:6px 16px;font-size:12px;color:var(--lc-muted);background:var(--lc-surface-2);
  border-bottom:1px solid var(--lc-line)}

/* logo (header 40px / pre-chat 56px / avatar nhóm chat 24px) */
.lc-logo{border-radius:50%;object-fit:cover;flex:0 0 auto;display:flex;align-items:center;
  justify-content:center;font-weight:700}
.lc-logo-fallback{background:rgba(255,255,255,.25);color:var(--lc-on-primary)}
.lc-logo-fallback-solid{background:var(--lc-primary-strong,var(--lc-primary));color:var(--lc-on-primary)}

.lc-body{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;background:var(--lc-surface)}
.lc-group{display:flex;flex-direction:column}
.lc-group + .lc-group{margin-top:10px}
.lc-group-row{display:flex;gap:8px;align-items:flex-end;max-width:100%}
.lc-group-row.lc-out{justify-content:flex-end}
.lc-group-col{display:flex;flex-direction:column;gap:2px;max-width:80%;min-width:0}
.lc-group-avatar{width:24px;height:24px;font-size:11px}
.lc-group-time{font-size:12px;color:var(--lc-muted);margin-top:3px}
.lc-group-time.lc-out{text-align:end}

.lc-bubble{max-width:100%;padding:8px 12px;border-radius:14px;line-height:1.45;word-wrap:break-word;
  white-space:pre-wrap;overflow-wrap:anywhere}
.lc-in .lc-bubble,.lc-group-row.lc-in .lc-bubble{background:var(--lc-bg);border:1px solid var(--lc-line);
  border-bottom-left-radius:4px;color:var(--lc-text)}
.lc-out .lc-bubble,.lc-group-row.lc-out .lc-bubble{background:var(--lc-primary-strong,var(--lc-primary));
  color:var(--lc-on-primary);border-bottom-right-radius:4px}
/* Dòng trạng thái: chỉ còn NÚT "thử lại" khi gửi lỗi (trạng thái đang gửi/đã gửi gộp vào dòng giờ cuối
   nhóm — xem ui.ts renderGroup). Phải là <button> thật: bàn phím tab tới được, Enter/Space kích retry. */
.lc-status{appearance:none;border:0;background:transparent;font:inherit;font-size:12px;line-height:1.3;
  min-height:24px;padding:0;margin:2px 4px 0;color:var(--lc-muted);text-align:end}
.lc-status.lc-failed{color:var(--lc-danger);cursor:pointer;text-decoration:underline dotted}
.lc-status:focus-visible{outline:2px solid var(--lc-danger);outline-offset:2px;border-radius:4px}
.lc-bubble.lc-failed{background:var(--lc-danger);color:var(--lc-danger-on)}
.lc-typing{align-self:flex-start;background:var(--lc-bg);border:1px solid var(--lc-line);border-radius:14px;
  border-bottom-left-radius:4px;padding:10px 14px;display:inline-flex;gap:4px;margin-top:10px}
.lc-typing span{width:6px;height:6px;border-radius:50%;background:var(--lc-muted);animation:lcb 1.2s infinite}
.lc-typing span:nth-child(2){animation-delay:.2s}.lc-typing span:nth-child(3){animation-delay:.4s}
@keyframes lcb{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}

/* tin mới (story-07 AC5) — tắt khi prefers-reduced-motion */
@keyframes lcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.lc-new{animation:lcIn .16s ease-out}
@media (prefers-reduced-motion: reduce){
  .lc-new{animation:none}
  /* 3 chấm "đang gõ"/đang kết nối: bỏ nhấp nháy, giữ độ mờ cố định để vẫn đọc được là placeholder. */
  .lc-typing span{animation:none;opacity:.6}
}

.lc-composer{flex:0 0 auto;border-top:1px solid var(--lc-line);display:flex;gap:8px;align-items:flex-end;
  padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));background:var(--lc-bg)}
.lc-composer textarea{flex:1 1 auto;resize:none;border:1px solid var(--lc-line);border-radius:22px;padding:9px 14px;
  font:inherit;max-height:120px;outline:none;line-height:1.4;background:var(--lc-bg);color:var(--lc-text)}
.lc-composer textarea:focus{border-color:var(--lc-primary);box-shadow:0 0 0 3px var(--lc-primary-soft)}
.lc-composer textarea::placeholder,.lc-field input::placeholder,.lc-field textarea::placeholder{
  color:var(--lc-muted);opacity:1}
.lc-send{flex:0 0 auto;width:40px;height:40px;border-radius:50%;border:0;
  background:var(--lc-primary-strong,var(--lc-primary));color:var(--lc-on-primary);
  cursor:pointer;display:flex;align-items:center;justify-content:center}
.lc-send:disabled{opacity:.5;cursor:default}

/* pre-chat (story-07 AC3) */
.lc-prechat{flex:1 1 auto;min-height:0;padding:20px 16px;display:flex;flex-direction:column;gap:12px;
  overflow-y:auto}
.lc-prechat-logo{display:flex;justify-content:center;margin-bottom:2px}
.lc-prechat-logo .lc-logo{width:56px;height:56px;font-size:22px}
.lc-greeting{margin:0;color:var(--lc-muted);font-size:13px;text-align:center}
.lc-field label{display:block;font-size:12px;font-weight:600;margin-bottom:5px}
.lc-field input,.lc-field textarea{width:100%;border:1px solid var(--lc-line);border-radius:10px;
  padding:10px 12px;font:inherit;outline:none;background:var(--lc-bg);color:var(--lc-text)}
/* iOS zoom KHI FOCUS ô nhập nếu font < 16px (Safari phóng to cả trang, không cách nào undo). 16px là mặc
   định; từ 481px trở lên (khớp isMobile() + @media (max-width:480px) của loader — GIỮ 3 nơi cùng số) mới
   về 14px cho gọn. Đặt SAU khai báo font:inherit ở trên vì shorthand đó reset font-size. */
.lc-composer textarea,.lc-field input,.lc-field textarea{font-size:16px}
@media (min-width:481px){.lc-composer textarea,.lc-field input,.lc-field textarea{font-size:14px}}
.lc-field textarea{resize:none}
.lc-field input:focus,.lc-field textarea:focus{border-color:var(--lc-primary);
  box-shadow:0 0 0 3px var(--lc-primary-soft)}
/* CLS: dòng lỗi LUÔN chiếm chỗ (visibility, KHÔNG display:none) — hiện lỗi không đẩy các ô bên dưới
   nhảy xuống. min-height khớp 1 dòng 12px/1.2. */
.lc-field .lc-err{color:var(--lc-danger);font-size:12px;line-height:1.2;margin-top:4px;
  min-height:1.2em;visibility:hidden}
.lc-field.lc-invalid .lc-err{visibility:visible}
.lc-field.lc-invalid input,.lc-field.lc-invalid textarea{border-color:var(--lc-danger)}
.lc-primary-btn{border:0;border-radius:10px;background:var(--lc-primary-strong,var(--lc-primary));
  color:var(--lc-on-primary);padding:11px;font:inherit;font-weight:600;cursor:pointer}
.lc-primary-btn:disabled{opacity:.6;cursor:default}

.lc-center{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:24px;gap:10px;color:var(--lc-muted)}
.lc-center svg{opacity:.5}
.lc-note{font-size:12px;color:var(--lc-muted);text-align:center;padding:6px 12px}

/* footer bắt buộc (story-07 AC6) — 4 màn loading/offline/pre-chat/chat, KHÔNG có cờ tắt.
   KHÔNG dùng flex ở đây: text node "Cung cấp bởi " và thẻ <a> thành 2 flex item ⇒ mất khoảng trắng giữa
   chúng ("Cung cấp bởiCluvixHealth"). Căn giữa bằng text-align + line-height. */
.lc-footer{flex:0 0 auto;height:auto;min-height:32px;line-height:32px;text-align:center;font-size:12px;
  padding-bottom:env(safe-area-inset-bottom,0px);
  color:var(--lc-muted);border-top:1px solid var(--lc-line);background:var(--lc-bg)}
.lc-footer a{color:inherit;text-decoration:underline}

/* Vùng chỉ dành cho screen reader (aria-live) — không chiếm chỗ, không nhìn thấy. */
.lc-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}

/* story B-05: compact-preview — hiện trong khung nhỏ (loader resize theo set_compact_view), thay html/body
   height:100% (ở trên) bằng khối auto-height để loader đo đúng chiều cao thật cần cho khung. */
.lc-preview{position:relative;height:auto;min-height:0;background:var(--lc-bg);border-radius:14px;
  box-shadow:0 1px 3px rgba(0,0,0,.08);padding:12px 32px 12px 12px}
.lc-preview-x{position:absolute;top:6px;right:6px;appearance:none;border:0;background:transparent;
  color:var(--lc-muted);cursor:pointer;padding:4px;border-radius:50%;display:flex}
.lc-preview-x:hover{background:var(--lc-in-bg);color:var(--lc-text)}
/* B-06: cả khối message là 1 <button> thật (bàn phím tab+Enter/Space kích được) — reset toàn bộ style nút. */
.lc-preview-body{appearance:none;border:0;background:transparent;text-align:start;font:inherit;color:inherit;
  width:100%;padding:0;cursor:pointer;display:flex;align-items:flex-start;gap:10px}
.lc-preview-body:focus-visible{outline:2px solid var(--lc-primary);outline-offset:2px;border-radius:8px}
.lc-preview-avatar{width:36px;height:36px;border-radius:50%;flex:0 0 auto;object-fit:cover;background:var(--lc-in-bg)}
.lc-preview-avatar-fallback{display:flex;align-items:center;justify-content:center;
  background:var(--lc-primary-strong,var(--lc-primary));
  color:var(--lc-on-primary);font-weight:700;font-size:14px}
.lc-preview-text{min-width:0;flex:1 1 auto}
.lc-preview-name{font-size:12px;font-weight:700;color:var(--lc-text);margin-bottom:2px}
.lc-preview-msg{font-size:13px;color:var(--lc-text);line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;
  -webkit-box-orient:vertical;overflow:hidden}
`;
