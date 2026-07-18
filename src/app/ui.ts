// UI iframe app: header + vùng tin + composer + pre-chat form + trạng thái offline/loading.
// An toàn XSS: nội dung tin render bằng textContent (KHÔNG innerHTML) — content staff/visitor không tin cậy.
import { APP_CSS } from './styles';
import { SRC_INTERNAL, SRC_VISITOR, type PreChatForm, type WidgetMessage, type WidgetTheme } from '../shared/types';

export interface UiCallbacks {
  onSend: (text: string) => void;
  onTyping: () => void;
  onClose: () => void;
  onSubmitPreChat: (name: string, phone: string) => void;
  onRetry: (echoId: string, text: string) => void;
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

export class WidgetUI {
  private host: HTMLElement;
  private theme: WidgetTheme;
  private cb: UiCallbacks;

  private bodyEl: HTMLElement | null = null;
  private typingEl: HTMLElement | null = null;
  private typingTimer: number | null = null;
  private messages: RenderMsg[] = [];
  private greeting = '';

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
    document.documentElement.style.setProperty('--lc-primary', theme.primary_color || '#1677ff');
  }

  private header(): string {
    const title = (this.theme.launcher_label || '').trim() || 'Trò chuyện';
    return `<div class="lc-header"><div><h1>${escapeText(title)}</h1></div>
      <button class="lc-x" type="button" aria-label="Đóng">${xIcon()}</button></div>`;
  }

  private wireClose() {
    this.host.querySelector<HTMLButtonElement>('.lc-x')?.addEventListener('click', () => this.cb.onClose());
  }

  showLoading() {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${chatDots()}<div>Đang kết nối…</div></div></div>`;
    this.wireClose();
  }

  showOffline(text: string) {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${offlineIcon()}<div class="lc-off-text"></div></div></div>`;
    this.host.querySelector<HTMLElement>('.lc-off-text')!.textContent =
      text || this.theme.offline_text || 'Hiện kênh trò chuyện không khả dụng.';
    this.wireClose();
  }

  showPreChat(cfg: PreChatForm, greeting: string) {
    const nameField = cfg.require_name
      ? field('lc-name', 'Họ tên', 'text', 'Nhập họ tên', 'Vui lòng nhập họ tên.')
      : '';
    const phoneField = cfg.require_phone
      ? field('lc-phone', 'Số điện thoại', 'tel', 'Nhập số điện thoại', 'Số điện thoại không hợp lệ.')
      : '';
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-prechat">
        <p>${escapeText(greeting || this.theme.greeting_text)}</p>
        ${nameField}${phoneField}
        <button class="lc-primary-btn" type="button">Bắt đầu trò chuyện</button>
      </div></div>`;
    this.wireClose();
    const btn = this.host.querySelector<HTMLButtonElement>('.lc-primary-btn')!;
    btn.addEventListener('click', () => this.submitPreChat(cfg));
  }

  private submitPreChat(cfg: PreChatForm) {
    let ok = true;
    let name = '';
    let phone = '';
    if (cfg.require_name) {
      const wrap = this.host.querySelector<HTMLElement>('#lc-name-field')!;
      const input = this.host.querySelector<HTMLInputElement>('#lc-name')!;
      name = input.value.trim();
      const bad = name.length < 1;
      wrap.classList.toggle('lc-invalid', bad);
      if (bad) ok = false;
    }
    if (cfg.require_phone) {
      const wrap = this.host.querySelector<HTMLElement>('#lc-phone-field')!;
      const input = this.host.querySelector<HTMLInputElement>('#lc-phone')!;
      phone = input.value.trim();
      const bad = !isValidVNMobile(phone);
      wrap.classList.toggle('lc-invalid', bad);
      if (bad) ok = false;
    }
    if (!ok) return;
    const btn = this.host.querySelector<HTMLButtonElement>('.lc-primary-btn')!;
    btn.disabled = true;
    btn.textContent = 'Đang kết nối…';
    this.cb.onSubmitPreChat(name, phone);
  }

  showChat(greeting: string) {
    this.greeting = greeting || this.theme.greeting_text;
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-body" role="log" aria-live="polite"></div>
      <div class="lc-composer">
        <textarea rows="1" placeholder="Nhập tin nhắn…" aria-label="Nhập tin nhắn"></textarea>
        <button class="lc-send" type="button" aria-label="Gửi" disabled>${sendIcon()}</button>
      </div></div>`;
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

  private renderList() {
    if (!this.bodyEl) return;
    const nearBottom =
      this.bodyEl.scrollHeight - this.bodyEl.scrollTop - this.bodyEl.clientHeight < 60;
    this.bodyEl.textContent = '';

    if (this.greeting) {
      this.bodyEl.appendChild(this.bubble({ src: 1, content: this.greeting, sentAt: 0, status: 'sent' }, false));
    }
    const sorted = [...this.messages].sort((a, b) => a.sentAt - b.sentAt);
    for (const m of sorted) this.bodyEl.appendChild(this.bubble(m, true));

    if (this.typingEl) this.bodyEl.appendChild(this.typingEl);
    if (nearBottom) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  private bubble(m: RenderMsg, withMeta: boolean): HTMLElement {
    const out = m.src === SRC_VISITOR;
    const row = document.createElement('div');
    row.className = `lc-row ${out ? 'lc-out' : 'lc-in'}${m.status === 'failed' ? ' lc-failed' : ''}`;
    const b = document.createElement('div');
    b.className = 'lc-bubble';
    b.textContent = m.content; // XSS-safe
    row.appendChild(b);
    if (withMeta && out) {
      const meta = document.createElement('div');
      meta.className = 'lc-meta lc-status';
      meta.textContent =
        m.status === 'sending' ? 'Đang gửi…' : m.status === 'failed' ? 'Gửi lỗi · chạm để thử lại' : 'Đã gửi';
      b.appendChild(meta);
      if (m.status === 'failed' && m.echoId) {
        row.style.cursor = 'pointer';
        const echoId = m.echoId;
        const text = m.content;
        row.addEventListener('click', () => this.cb.onRetry(echoId, text));
      }
    }
    return row;
  }

  showStaffTyping() {
    if (!this.bodyEl) return;
    if (!this.typingEl) {
      this.typingEl = document.createElement('div');
      this.typingEl.className = 'lc-typing';
      this.typingEl.setAttribute('aria-label', 'Nhân viên đang trả lời');
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
function field(id: string, label: string, type: string, ph: string, err: string): string {
  return `<div class="lc-field" id="${id}-field">
    <label for="${id}">${escapeText(label)}</label>
    <input id="${id}" type="${type}" placeholder="${escapeAttr(ph)}" autocomplete="${type === 'tel' ? 'tel' : 'name'}"/>
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
  return `<div class="lc-typing" style="align-self:center"><span></span><span></span><span></span></div>`;
}
