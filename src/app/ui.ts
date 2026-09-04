// UI iframe app: header (thương hiệu) + vùng tin + composer + pre-chat form + trạng thái offline/loading +
// footer bắt buộc (story-07 UI v2). An toàn XSS: mọi nội dung động render bằng textContent/escapeText/
// escapeAttr (KHÔNG innerHTML) — content staff/visitor/theme không tin cậy (story-07 AC8). Ngoại lệ duy
// nhất: `logo_url` chỉ gán vào `src` sau khi xác nhận `protocol === 'https:'` (safeLogoUrl), và
// `STRINGS.footerHtml` là HTML tĩnh KHÔNG chứa biến/config nên an toàn gán thẳng.
import { APP_CSS } from './styles';
import { STRINGS } from './strings';
import {
  SRC_INTERNAL,
  SRC_VISITOR,
  type CampaignPreview,
  type PreChatForm,
  type WidgetMessage,
  type WidgetTheme,
} from '../shared/types';

export interface UiCallbacks {
  onSend: (text: string) => void;
  onTyping: () => void;
  onClose: () => void;
  onSubmitPreChat: (name: string, phone: string, message: string) => void;
  onRetry: (echoId: string, text: string) => void;
}

export interface CampaignPreviewCallbacks {
  onClick: () => void;
  onDismiss: () => void;
}

interface RenderMsg {
  id?: number;
  echoId?: string;
  src: number;
  content: string;
  sentAt: number;
  status: 'sent' | 'sending' | 'failed';
}

/** Validate SĐT di động VN (client-side; BE là nguồn chân lý — 422 nếu lệch). +84/0 + đầu 3/5/7/8/9 + 8 số. */
export function isValidVNMobile(raw: string): boolean {
  const s = raw.replace(/[\s.\-()]/g, '');
  return /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(s);
}

const timeFormatter = new Intl.DateTimeFormat('vi', { hour: '2-digit', minute: '2-digit' });

export class WidgetUI {
  private host: HTMLElement;
  private theme: WidgetTheme;
  private cb: UiCallbacks;

  private bodyEl: HTMLElement | null = null;
  private typingEl: HTMLElement | null = null;
  private typingTimer: number | null = null;
  private messages: RenderMsg[] = [];
  private greeting = '';
  private connected = false; // story-07 AC2 — chấm trạng thái header, cập nhật qua setConnected()
  private identityDisplayName = ''; // story-07 AC7
  private animatedKeys = new Set<string>(); // story-07 AC5 — chỉ animate tin THẬT SỰ mới, không replay mỗi renderList()

  constructor(host: HTMLElement, theme: WidgetTheme, cb: UiCallbacks) {
    this.host = host;
    this.theme = theme;
    this.cb = cb;
    const style = document.createElement('style');
    style.textContent = APP_CSS;
    document.head.appendChild(style);
    this.applyTheme(theme);
  }

  applyTheme(theme: WidgetTheme) {
    this.theme = theme;
    const primary = theme.primary_color || '#1677ff';
    const root = document.documentElement.style;
    root.setProperty('--lc-primary', primary);
    root.setProperty('--lc-on-primary', onPrimaryColor(primary));
    root.setProperty('--lc-primary-soft', primarySoft(primary));
  }

  /** story-07 AC2 — cập nhật chấm trạng thái + subtitle mặc định (khi admin chưa cấu hình subtitle riêng)
   * mà KHÔNG render lại toàn bộ header (giữ focus composer nếu đang gõ). */
  setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    const dot = this.host.querySelector<HTMLElement>('.lc-dot');
    if (!dot) return;
    dot.classList.toggle('lc-dot-on', connected);
    if (!(this.theme.subtitle || '').trim()) {
      const sub = dot.nextElementSibling as HTMLElement | null;
      if (sub) sub.textContent = connected ? STRINGS.statusOnline : STRINGS.statusOffline;
    }
  }

  /** story-07 AC7 — dòng "Bạn đang trò chuyện với tư cách {display_name}" dưới header. Cập nhật cả khi
   * header đã render (setUser re-handshake giữa phiên — ngoài phạm vi loader story-08 nhưng UI vẫn phải
   * phản ánh đúng nếu 'session' đến sau). */
  setIdentity(displayName: string) {
    this.identityDisplayName = (displayName || '').trim();
    const wrap = this.host.querySelector<HTMLElement>('.lc-header-wrap');
    if (!wrap) return;
    let el = wrap.querySelector<HTMLElement>('.lc-identity');
    if (this.identityDisplayName) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'lc-identity';
        wrap.appendChild(el);
      }
      el.textContent = STRINGS.identifiedAs(this.identityDisplayName);
    } else if (el) {
      el.remove();
    }
  }

  private brandName(): string {
    return (this.theme.brand_name || this.theme.launcher_label || '').trim() || STRINGS.defaultBrand;
  }

  private safeLogoUrl(): string | null {
    const raw = (this.theme.logo_url || '').trim();
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' ? raw : null; // AC8 — chỉ https mới gán vào src
    } catch {
      return null;
    }
  }

  private logoHtml(size: number, solidFallback: boolean): string {
    const url = this.safeLogoUrl();
    const style = `width:${size}px;height:${size}px`;
    if (url) return `<img class="lc-logo" style="${style}" src="${escapeAttr(url)}" alt=""/>`;
    const initial = escapeText(this.brandName().charAt(0).toUpperCase() || '?');
    const cls = solidFallback ? 'lc-logo lc-logo-fallback-solid' : 'lc-logo lc-logo-fallback';
    return `<div class="${cls}" style="${style}">${initial}</div>`;
  }

  private header(): string {
    const brand = this.brandName();
    const subtitleRaw = (this.theme.subtitle || '').trim();
    const subtitle = subtitleRaw || (this.connected ? STRINGS.statusOnline : STRINGS.statusOffline);
    const dotCls = this.connected ? 'lc-dot lc-dot-on' : 'lc-dot';
    const identity = this.identityDisplayName
      ? `<div class="lc-identity">${escapeText(STRINGS.identifiedAs(this.identityDisplayName))}</div>`
      : '';
    return `<div class="lc-header-wrap">
      <div class="lc-header">
        <div class="lc-header-brand">
          ${this.logoHtml(40, false)}
          <div class="lc-header-text">
            <h1>${escapeText(brand)}</h1>
            <div class="lc-header-sub"><span class="${dotCls}"></span><span>${escapeText(subtitle)}</span></div>
          </div>
        </div>
        <button class="lc-x" type="button" aria-label="${escapeAttr(STRINGS.close)}">${xIcon()}</button>
      </div>
      ${identity}
    </div>`;
  }

  private footer(): string {
    // story-07 AC6 — bắt buộc, không có cờ tắt. footerHtml là HTML tĩnh (không biến), an toàn.
    return `<div class="lc-footer">${STRINGS.footerHtml}</div>`;
  }

  private wireClose() {
    this.host.querySelector<HTMLButtonElement>('.lc-x')?.addEventListener('click', () => this.cb.onClose());
  }

  showLoading() {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${chatDots()}<div>${escapeText(STRINGS.connecting)}</div></div>
      ${this.footer()}</div>`;
    this.wireClose();
  }

  showOffline(text: string) {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${offlineIcon()}<div class="lc-off-text"></div></div>
      ${this.footer()}</div>`;
    this.host.querySelector<HTMLElement>('.lc-off-text')!.textContent =
      text || this.theme.offline_text || STRINGS.offlineDefault;
    this.wireClose();
  }

  showPreChat(cfg: PreChatForm, greeting: string) {
    const nameField = cfg.require_name
      ? field('lc-name', STRINGS.nameLabel, 'text', STRINGS.namePlaceholder, STRINGS.nameError)
      : '';
    const phoneField = cfg.require_phone
      ? field('lc-phone', STRINGS.phoneLabel, 'tel', STRINGS.phonePlaceholder, STRINGS.phoneError)
      : '';
    const messageField = cfg.require_message
      ? field('lc-message', STRINGS.messageLabel, 'text', STRINGS.messagePlaceholder, STRINGS.messageError, true)
      : '';
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-prechat">
        <div class="lc-prechat-logo">${this.logoHtml(56, true)}</div>
        <p class="lc-greeting">${escapeText(greeting || this.theme.greeting_text)}</p>
        ${nameField}${phoneField}${messageField}
        <button class="lc-primary-btn" type="button" disabled>${escapeText(STRINGS.submitPreChat)}</button>
      </div>
      ${this.footer()}</div>`;
    this.wireClose();

    const btn = this.host.querySelector<HTMLButtonElement>('.lc-primary-btn')!;
    const nameInput = cfg.require_name ? this.host.querySelector<HTMLInputElement>('#lc-name') : null;
    const phoneInput = cfg.require_phone ? this.host.querySelector<HTMLInputElement>('#lc-phone') : null;
    const messageInput = cfg.require_message
      ? this.host.querySelector<HTMLTextAreaElement>('#lc-message')
      : null;

    const nameValid = (v: string) => v.trim().length >= 1;
    const phoneValid = (v: string) => isValidVNMobile(v.trim());
    const messageValid = (v: string) => v.trim().length >= 1;

    const isValid = (): boolean =>
      (!nameInput || nameValid(nameInput.value)) &&
      (!phoneInput || phoneValid(phoneInput.value)) &&
      (!messageInput || messageValid(messageInput.value));

    const updateBtn = () => {
      btn.disabled = !isValid();
    };

    const wireField = (
      input: HTMLInputElement | HTMLTextAreaElement | null,
      valid: (v: string) => boolean,
    ) => {
      if (!input) return;
      const wrap = input.closest<HTMLElement>('.lc-field')!;
      input.addEventListener('input', updateBtn);
      input.addEventListener('blur', () => wrap.classList.toggle('lc-invalid', !valid(input.value)));
    };
    wireField(nameInput, nameValid);
    wireField(phoneInput, phoneValid);
    wireField(messageInput, messageValid);

    const trySubmit = () => {
      let ok = true;
      const check = (input: HTMLInputElement | HTMLTextAreaElement | null, valid: (v: string) => boolean) => {
        if (!input) return;
        const wrap = input.closest<HTMLElement>('.lc-field')!;
        const bad = !valid(input.value);
        wrap.classList.toggle('lc-invalid', bad);
        if (bad) ok = false;
      };
      check(nameInput, nameValid);
      check(phoneInput, phoneValid);
      check(messageInput, messageValid);
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = STRINGS.submitPreChatSending;
      this.cb.onSubmitPreChat(
        nameInput?.value.trim() || '',
        phoneInput?.value.trim() || '',
        messageInput?.value.trim() || '',
      );
    };

    // AC3: Enter ở ô tin nhắn = gửi (Shift+Enter vẫn xuống dòng, khớp hành vi composer chat).
    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        trySubmit();
      }
    });
    btn.addEventListener('click', trySubmit);
    updateBtn();
  }

  /** story B-05 (AC1/AC2) — bong bóng preview nhỏ (message + sender), KHÔNG mở full chat. Trả về chiều cao
   * thật (px) của khối vừa render để caller (main.ts) xin loader resize iframe đúng khít (postMessage
   * set_compact_view). sender null → fallback avatar chữ cái đầu + tên site (OD-B5). */
  showCampaignPreview(campaign: CampaignPreview, siteFallbackName: string, cb: CampaignPreviewCallbacks): number {
    const name = (campaign.sender?.name || siteFallbackName || STRINGS.defaultBrand).trim() || STRINGS.defaultBrand;
    const avatarUrl = campaign.sender?.avatar || '';
    const avatarHtml = avatarUrl
      ? `<img class="lc-preview-avatar" src="${escapeAttr(avatarUrl)}" alt=""/>`
      : `<div class="lc-preview-avatar lc-preview-avatar-fallback">${escapeText(name.charAt(0).toUpperCase() || '?')}</div>`;
    this.host.innerHTML = `<div class="lc-preview">
      <button class="lc-preview-x" type="button" aria-label="${escapeAttr(STRINGS.close)}">${xIcon()}</button>
      <div class="lc-preview-body">
        ${avatarHtml}
        <div class="lc-preview-text">
          <div class="lc-preview-name">${escapeText(name)}</div>
          <div class="lc-preview-msg">${escapeText(campaign.message)}</div>
        </div>
      </div></div>`;
    this.host.querySelector<HTMLButtonElement>('.lc-preview-x')!.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.onDismiss();
    });
    this.host.querySelector<HTMLElement>('.lc-preview-body')!.addEventListener('click', () => cb.onClick());
    const el = this.host.querySelector<HTMLElement>('.lc-preview')!;
    return el.getBoundingClientRect().height || 96;
  }

  showChat(greeting: string) {
    this.greeting = greeting || this.theme.greeting_text;
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-body" role="log" aria-live="polite"></div>
      <div class="lc-composer">
        <textarea rows="1" placeholder="${escapeAttr(STRINGS.composerPlaceholder)}" aria-label="${escapeAttr(STRINGS.composerAriaLabel)}"></textarea>
        <button class="lc-send" type="button" aria-label="${escapeAttr(STRINGS.sendAriaLabel)}" disabled>${sendIcon()}</button>
      </div>
      ${this.footer()}</div>`;
    this.wireClose();
    this.bodyEl = this.host.querySelector<HTMLElement>('.lc-body');
    const ta = this.host.querySelector<HTMLTextAreaElement>('textarea')!;
    const send = this.host.querySelector<HTMLButtonElement>('.lc-send')!;

    const sync = () => {
      send.disabled = ta.value.trim().length === 0;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
    };
    ta.addEventListener('input', () => {
      sync();
      this.cb.onTyping();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.fireSend(ta);
      }
    });
    send.addEventListener('click', () => this.fireSend(ta));
    this.renderList();
  }

  private fireSend(ta: HTMLTextAreaElement) {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = 'auto';
    (this.host.querySelector<HTMLButtonElement>('.lc-send'))!.disabled = true;
    this.cb.onSend(text);
  }

  // ── message list (dedup by id / echoId) ──
  private find(id?: number, echoId?: string): RenderMsg | undefined {
    return this.messages.find(
      (m) => (id != null && m.id === id) || (echoId != null && echoId !== '' && m.echoId === echoId),
    );
  }

  setHistory(msgs: WidgetMessage[]) {
    for (const sm of msgs) {
      if (sm.src === SRC_INTERNAL) continue; // note nội bộ — không hiện cho khách
      this.upsertServer(sm);
    }
    this.renderList();
  }

  addIncoming(sm: WidgetMessage) {
    if (sm.src === SRC_INTERNAL) return;
    this.hideStaffTyping();
    if (this.upsertServer(sm)) this.renderList();
  }

  private upsertServer(sm: WidgetMessage): boolean {
    const echoId = sm.client_echo_id || undefined;
    const existing = this.find(sm.id, echoId);
    const content = sm.content ?? '';
    if (existing) {
      existing.id = sm.id;
      existing.content = content;
      existing.sentAt = sm.sent_at;
      existing.status = 'sent';
      if (echoId) existing.echoId = echoId;
      return true;
    }
    this.messages.push({ id: sm.id, echoId, src: sm.src, content, sentAt: sm.sent_at, status: 'sent' });
    return true;
  }

  addOptimistic(echoId: string, text: string) {
    this.messages.push({ echoId, src: SRC_VISITOR, content: text, sentAt: Date.now(), status: 'sending' });
    this.renderList();
  }

  markSending(echoId: string) {
    const m = this.find(undefined, echoId);
    if (m) {
      m.status = 'sending';
      this.renderList();
    }
  }

  markFailed(echoId: string) {
    const m = this.find(undefined, echoId);
    if (m) {
      m.status = 'failed';
      this.renderList();
    }
  }

  ackOptimistic(echoId: string, sm: WidgetMessage) {
    const m = this.find(sm.id, echoId);
    if (m) {
      m.id = sm.id;
      m.status = 'sent';
      m.sentAt = sm.sent_at;
      m.content = sm.content ?? m.content;
    }
    this.renderList();
  }

  // story-07 AC5 — nhóm tin liên tiếp cùng src (gap 2px trong nhóm/10px giữa nhóm qua CSS .lc-group),
  // avatar 24px cạnh nhóm staff (src=1), giờ HH:mm dưới mỗi nhóm.
  private renderList() {
    if (!this.bodyEl) return;
    const nearBottom =
      this.bodyEl.scrollHeight - this.bodyEl.scrollTop - this.bodyEl.clientHeight < 60;
    this.bodyEl.textContent = '';

    const items: RenderMsg[] = [];
    if (this.greeting) items.push({ src: 1, content: this.greeting, sentAt: 0, status: 'sent' });
    items.push(...[...this.messages].sort((a, b) => a.sentAt - b.sentAt));

    const groups: RenderMsg[][] = [];
    for (const m of items) {
      const last = groups[groups.length - 1];
      if (last && last[0].src === m.src) last.push(m);
      else groups.push([m]);
    }
    for (const g of groups) this.bodyEl.appendChild(this.renderGroup(g));

    if (this.typingEl) this.bodyEl.appendChild(this.typingEl);
    if (nearBottom) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private renderGroup(group: RenderMsg[]): HTMLElement {
    const out = group[0].src === SRC_VISITOR;
    const wrap = document.createElement('div');
    wrap.className = 'lc-group';

    const row = document.createElement('div');
    row.className = `lc-group-row ${out ? 'lc-out' : 'lc-in'}`;
    if (!out) row.appendChild(this.avatarEl());
    const col = document.createElement('div');
    col.className = 'lc-group-col';
    for (const m of group) col.appendChild(this.bubble(m, out));
    row.appendChild(col);
    wrap.appendChild(row);

    const last = group[group.length - 1];
    if (last.sentAt > 0) {
      const time = document.createElement('div');
      time.className = `lc-group-time${out ? ' lc-out' : ''}`;
      time.textContent = timeFormatter.format(new Date(last.sentAt)); // sent_at = MILLISECOND (gotcha #7)
      wrap.appendChild(time);
    }
    return wrap;
  }

  private avatarEl(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = this.logoHtml(24, true); // markup tự sinh (đã escape ở logoHtml) — an toàn gán innerHTML
    const el = wrap.firstElementChild as HTMLElement;
    el.classList.add('lc-group-avatar');
    return el;
  }

  private bubble(m: RenderMsg, out: boolean): HTMLElement {
    const key = m.id != null ? `id:${m.id}` : m.echoId ? `echo:${m.echoId}` : `t:${m.sentAt}`;
    const b = document.createElement('div');
    b.className = `lc-bubble${m.status === 'failed' ? ' lc-failed' : ''}`;
    if (!this.animatedKeys.has(key)) {
      b.classList.add('lc-new');
      this.animatedKeys.add(key);
    }
    b.textContent = m.content; // XSS-safe
    if (out) {
      const meta = document.createElement('div');
      meta.className = 'lc-meta lc-status';
      meta.textContent =
        m.status === 'sending' ? STRINGS.statusSending : m.status === 'failed' ? STRINGS.statusFailed : STRINGS.statusSent;
      b.appendChild(meta);
    }
    if (m.status === 'failed' && m.echoId) {
      const echoId = m.echoId;
      const text = m.content;
      b.addEventListener('click', () => this.cb.onRetry(echoId, text));
    }
    return b;
  }

  showStaffTyping() {
    if (!this.bodyEl) return;
    if (!this.typingEl) {
      this.typingEl = document.createElement('div');
      this.typingEl.className = 'lc-typing';
      this.typingEl.setAttribute('aria-label', STRINGS.typingAriaLabel);
      this.typingEl.innerHTML = '<span></span><span></span><span></span>';
    }
    this.renderList();
    if (this.typingTimer !== null) window.clearTimeout(this.typingTimer);
    this.typingTimer = window.setTimeout(() => this.hideStaffTyping(), 4000);
  }

  hideStaffTyping() {
    if (this.typingTimer !== null) {
      window.clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    if (this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
  }

  /** Số tin staff chưa đọc (để loader hiện badge) — main tự đếm; UI không giữ trạng thái mở/đóng. */
  hasBody(): boolean {
    return this.bodyEl != null;
  }
}

// ── helpers ──
function field(id: string, label: string, type: string, ph: string, err: string, multiline = false): string {
  const control = multiline
    ? `<textarea id="${id}" rows="2" placeholder="${escapeAttr(ph)}"></textarea>`
    : `<input id="${id}" type="${type}" placeholder="${escapeAttr(ph)}" autocomplete="${type === 'tel' ? 'tel' : 'name'}"/>`;
  return `<div class="lc-field" id="${id}-field">
    <label for="${id}">${escapeText(label)}</label>
    ${control}
    <div class="lc-err">${escapeText(err)}</div></div>`;
}
function escapeText(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── theme color math (AC2 — text luôn đủ contrast với primary_color admin chọn) ──
function hexToRgb(hex: string): [number, number, number] | null {
  const trimmed = hex.trim();
  // Bỏ # nếu có, rồi chuẩn hoá 3 digit → 6 digit
  let normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (normalized.length === 3) {
    normalized = normalized.split('').map(c => c + c).join('');
  }
  // Validate: đúng 6 hex digit
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  const n = parseInt(normalized, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function onPrimaryColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111827' : '#fff';
}
function primarySoft(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'rgba(22,119,255,.12)';
  const [r, g, b] = rgb;
  return `rgba(${r},${g},${b},.12)`;
}

function xIcon(): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>`;
}
function sendIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 20.5 22 12 3 3.5 3 10l13 2-13 2z"/></svg>`;
}
function offlineIcon(): string {
  return `<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.3 1.1 4.3 2.9 5.8L4 21l4.3-1.6c1.1.3 2.4.5 3.7.5 5.5 0 10-3.8 10-8.4S17.5 3 12 3z"/></svg>`;
}
function chatDots(): string {
  return `<div class="lc-typing" style="align-self:center;margin-top:0">${'<span></span>'.repeat(3)}</div>`;
}
