// CSS app iframe (inline vào widget.html qua singlefile). Iframe là document riêng → không leak ra trang
// khách. Màu chủ đạo qua biến --lc-primary (set từ theme). Gọn, không phụ thuộc framework.
export const APP_CSS = `
:root{--lc-primary:#1677ff;--lc-bg:#fff;--lc-muted:#6b7280;--lc-line:#e5e7eb;--lc-in-bg:#f1f3f5}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  background:var(--lc-bg);color:#111827;font-size:14px}
.lc-app{display:flex;flex-direction:column;height:100vh;height:100dvh}

.lc-header{flex:0 0 auto;background:var(--lc-primary);color:#fff;padding:14px 16px;display:flex;
  align-items:center;justify-content:space-between;gap:10px}
.lc-header h1{margin:0;font-size:15px;font-weight:600;line-height:1.3}
.lc-header .lc-sub{font-size:12px;opacity:.85;margin-top:2px}
.lc-x{appearance:none;border:0;background:transparent;color:#fff;cursor:pointer;padding:4px;border-radius:6px;
  display:flex;opacity:.9}
.lc-x:hover{opacity:1;background:rgba(255,255,255,.15)}

.lc-body{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#fafafa}
.lc-row{display:flex;max-width:100%}
.lc-row.lc-in{justify-content:flex-start}
.lc-row.lc-out{justify-content:flex-end}
.lc-bubble{max-width:80%;padding:8px 12px;border-radius:14px;line-height:1.45;word-wrap:break-word;
  white-space:pre-wrap;overflow-wrap:anywhere}
.lc-in .lc-bubble{background:#fff;border:1px solid var(--lc-line);border-bottom-left-radius:4px;color:#111827}
.lc-out .lc-bubble{background:var(--lc-primary);color:#fff;border-bottom-right-radius:4px}
.lc-meta{font-size:11px;color:var(--lc-muted);margin-top:3px;text-align:right}
.lc-out .lc-status{font-size:11px;opacity:.85}
.lc-out.lc-failed .lc-bubble{background:#e5484d}
.lc-typing{align-self:flex-start;background:#fff;border:1px solid var(--lc-line);border-radius:14px;
  border-bottom-left-radius:4px;padding:10px 14px;display:inline-flex;gap:4px}
.lc-typing span{width:6px;height:6px;border-radius:50%;background:var(--lc-muted);animation:lcb 1.2s infinite}
.lc-typing span:nth-child(2){animation-delay:.2s}.lc-typing span:nth-child(3){animation-delay:.4s}
@keyframes lcb{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}

.lc-composer{flex:0 0 auto;border-top:1px solid var(--lc-line);padding:10px;display:flex;gap:8px;align-items:flex-end;
  background:#fff}
.lc-composer textarea{flex:1 1 auto;resize:none;border:1px solid var(--lc-line);border-radius:20px;padding:9px 14px;
  font:inherit;max-height:96px;outline:none;line-height:1.4}
.lc-composer textarea:focus{border-color:var(--lc-primary)}
.lc-send{flex:0 0 auto;width:40px;height:40px;border-radius:50%;border:0;background:var(--lc-primary);color:#fff;
  cursor:pointer;display:flex;align-items:center;justify-content:center}
.lc-send:disabled{opacity:.5;cursor:default}

.lc-prechat{padding:18px 16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.lc-prechat p{margin:0;color:var(--lc-muted);font-size:13px}
.lc-field label{display:block;font-size:12px;font-weight:600;margin-bottom:5px}
.lc-field input{width:100%;border:1px solid var(--lc-line);border-radius:10px;padding:10px 12px;font:inherit;outline:none}
.lc-field input:focus{border-color:var(--lc-primary)}
.lc-field .lc-err{color:#e5484d;font-size:12px;margin-top:4px;display:none}
.lc-field.lc-invalid .lc-err{display:block}
.lc-field.lc-invalid input{border-color:#e5484d}
.lc-primary-btn{border:0;border-radius:10px;background:var(--lc-primary);color:#fff;padding:11px;font:inherit;
  font-weight:600;cursor:pointer}
.lc-primary-btn:disabled{opacity:.6;cursor:default}

.lc-center{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:24px;gap:10px;color:var(--lc-muted)}
.lc-center svg{opacity:.5}
.lc-note{font-size:12px;color:var(--lc-muted);text-align:center;padding:6px 12px}

/* story B-05: compact-preview — hiện trong khung nhỏ (loader resize theo set_compact_view), thay html/body
   height:100% (ở trên) bằng khối auto-height để loader đo đúng chiều cao thật cần cho khung. */
.lc-preview{position:relative;height:auto;min-height:0;background:var(--lc-bg);border-radius:14px;
  box-shadow:0 1px 3px rgba(0,0,0,.08);padding:12px 32px 12px 12px;cursor:pointer}
.lc-preview-x{position:absolute;top:6px;right:6px;appearance:none;border:0;background:transparent;
  color:var(--lc-muted);cursor:pointer;padding:4px;border-radius:50%;display:flex}
.lc-preview-x:hover{background:#f1f3f5;color:#111827}
.lc-preview-body{display:flex;align-items:flex-start;gap:10px}
.lc-preview-avatar{width:36px;height:36px;border-radius:50%;flex:0 0 auto;object-fit:cover;background:var(--lc-in-bg)}
.lc-preview-avatar-fallback{display:flex;align-items:center;justify-content:center;background:var(--lc-primary);
  color:#fff;font-weight:700;font-size:14px}
.lc-preview-text{min-width:0;flex:1 1 auto}
.lc-preview-name{font-size:12px;font-weight:700;color:#111827;margin-bottom:2px}
.lc-preview-msg{font-size:13px;color:#111827;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;
  -webkit-box-orient:vertical;overflow:hidden}
`;
