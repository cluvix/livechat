// Vùng tin nhắn: giữ mảng `messages` (dedup theo id/echoId), nhóm tin liên tiếp cùng src, render bong bóng
// + dòng giờ/trạng thái, nút thử lại, chỉ báo "đang trả lời" và vùng aria-live đọc TIN MỚI.
// XSS: nội dung tin luôn qua `textContent` (KHÔNG innerHTML).
import type { Dict, Locale } from '../../shared/strings';
import { SRC_INTERNAL, SRC_VISITOR, type WidgetMessage, type WidgetTheme } from '../../shared/types';
import { avatarEl } from './brand';
import type { RenderMsg } from './types';

// Giờ hiển thị theo locale — KHÔNG còn hằng module-level 'vi'.
export function makeTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
}

export class ChatList {
  private bodyEl: HTMLElement | null = null;
  private srEl: HTMLElement | null = null; // vùng aria-live ẩn (chỉ đọc TIN MỚI, không đọc lại cả log)
  private typingEl: HTMLElement | null = null;
  private typingTimer: number | null = null;
  private messages: RenderMsg[] = [];
  private greeting = '';
  private animatedKeys = new Set<string>(); // story-07 AC5 — chỉ animate tin THẬT SỰ mới, không replay mỗi renderList()

  constructor(
    private theme: WidgetTheme,
    private s: Dict,
    private timeFormatter: Intl.DateTimeFormat,
    private onRetry: (echoId: string, text: string) => void,
  ) {}

  setTheme(theme: WidgetTheme) {
    this.theme = theme;
  }

  setStrings(s: Dict, timeFormatter: Intl.DateTimeFormat) {
    this.s = s;
    this.timeFormatter = timeFormatter;
  }

  /** Gắn vào DOM vừa render bởi facade (showChat) rồi vẽ danh sách lần đầu. */
  mount(bodyEl: HTMLElement | null, srEl: HTMLElement | null, greeting: string) {
    this.bodyEl = bodyEl;
    this.srEl = srEl;
    this.greeting = greeting;
    this.renderList();
  }

  /** Số tin staff chưa đọc (để loader hiện badge) — main tự đếm; UI không giữ trạng thái mở/đóng. */
  hasBody(): boolean {
    return this.bodyEl != null;
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
    // Chỉ đọc TIN VỪA ĐẾN. Trước đây aria-live nằm trên .lc-body mà renderList() xoá trắng rồi dựng lại
    // toàn bộ ⇒ screen reader đọc lại cả cuộc hội thoại sau mỗi tin.
    if (this.srEl) this.srEl.textContent = sm.content ?? '';
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
    if (!out) row.appendChild(avatarEl(this.theme, this.s));
    const col = document.createElement('div');
    col.className = 'lc-group-col';
    for (const m of group) {
      col.appendChild(this.bubble(m, out));
      // CLS: chỉ tin LỖI mới sinh thêm phần tử (nút thử lại). "Đang gửi…"/"Đã gửi" gộp vào dòng giờ cuối
      // nhóm — dòng đó luôn tồn tại nên không phần tử nào xuất hiện/biến mất khi tin đổi trạng thái
      // sending → sent (cách gọn, thay vì render placeholder visibility:hidden cho MỌI tin của khách).
      if (out && m.status === 'failed') col.appendChild(this.retryEl(m));
    }
    row.appendChild(col);
    wrap.appendChild(row);

    const last = group[group.length - 1];
    if (last.sentAt > 0) wrap.appendChild(this.groupTimeEl(last, out));
    return wrap;
  }

  private groupTimeEl(last: RenderMsg, out: boolean): HTMLElement {
    const time = document.createElement('div');
    time.className = `lc-group-time${out ? ' lc-out' : ''}`;
    time.setAttribute('aria-hidden', 'true'); // nhiễu với screen reader; nội dung tin đã đọc qua .lc-sr
    const hhmm = this.timeFormatter.format(new Date(last.sentAt)); // sent_at = MILLISECOND (gotcha #7)
    if (out && last.status === 'sending') time.textContent = this.s.statusSending;
    else if (out && last.status === 'sent') time.textContent = `${this.s.statusSent} · ${hhmm}`;
    else time.textContent = hhmm;
    return time;
  }

  /**
   * Nút "Gửi lỗi · chạm để thử lại" dưới bong bóng của khách. Là <button> THẬT (không phải <div>): đây là
   * điểm retry DUY NHẤT (bong bóng lỗi không còn bắt click) nên phải tab tới được + kích bằng bàn phím.
   */
  private retryEl(m: RenderMsg): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lc-status lc-failed';
    el.textContent = this.s.statusFailed;
    if (m.echoId) {
      const echoId = m.echoId;
      const text = m.content;
      el.addEventListener('click', () => this.onRetry(echoId, text));
    }
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
    void out;
    // KHÔNG gắn click retry lên bong bóng: giữ ĐÚNG 1 điểm retry (nút .lc-status.lc-failed bên dưới) —
    // bong bóng là <div>, click trên đó không tới được bằng bàn phím.
    return b;
  }

  showStaffTyping() {
    if (!this.bodyEl) return;
    if (!this.typingEl) {
      this.typingEl = document.createElement('div');
      this.typingEl.className = 'lc-typing';
      this.typingEl.setAttribute('aria-label', this.s.typingAriaLabel);
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
}
