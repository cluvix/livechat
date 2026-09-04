// UI iframe app: header (thương hiệu) + vùng tin + composer + pre-chat form + trạng thái offline/loading +
// footer bắt buộc (story-07 UI v2). An toàn XSS: mọi nội dung động render bằng textContent/escapeText/
// escapeAttr (KHÔNG innerHTML) — content staff/visitor/theme không tin cậy (story-07 AC8). Ngoại lệ duy
// nhất: `logo_url` chỉ gán vào `src` sau khi xác nhận `protocol === 'https:'` (safeLogoUrl), và
// `footerHtml` là HTML tĩnh KHÔNG chứa biến/config nên an toàn gán thẳng.
import { APP_CSS } from './styles';
import { t, type Dict, type Locale } from '../shared/strings';
import { onPrimaryColor, primarySoft, primaryStrong } from '../shared/color';
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

/** SĐT di động VN: +84/0 + đầu 3/5/7/8/9 + 8 số. */
const VN_MOBILE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;
/** E.164: dấu + tuỳ chọn, không bắt đầu bằng 0, tổng 7..15 chữ số. */
const E164 = /^\+?[1-9]\d{6,14}$/;

/**
 * Validate SĐT ở pre-chat (client-side; BE là nguồn chân lý — 422 nếu lệch).
 * `VN` (mặc định) chấp nhận số di động VN HOẶC E.164 — site VN vẫn nhận được khách nước ngoài.
 * `INTL` chỉ chấp nhận E.164.
 */
export function isValidPhone(raw: string, region: 'VN' | 'INTL' = 'VN'): boolean {
  const s = raw.replace(/[\s.\-()]/g, '');
  if (region === 'INTL') return E164.test(s);
  return VN_MOBILE.test(s) || E164.test(s);
}

export class WidgetUI {
  private host: HTMLElement;
  private theme: WidgetTheme;
  private cb: UiCallbacks;
  private locale: Locale;
  private s: Dict;
  private timeFormatter: Intl.DateTimeFormat;

  private bodyEl: HTMLElement | null = null;
  private srEl: HTMLElement | null = null; // vùng aria-live ẩn (chỉ đọc TIN MỚI, không đọc lại cả log)
  private typingEl: HTMLElement | null = null;
  private typingTimer: number | null = null;
  private messages: RenderMsg[] = [];
  private greeting = '';
  private connected = false; // story-07 AC2 — chấm trạng thái header, cập nhật qua setConnected()
  private identityDisplayName = ''; // story-07 AC7
  private animatedKeys = new Set<string>(); // story-07 AC5 — chỉ animate tin THẬT SỰ mới, không replay mỗi renderList()

  constructor(host: HTMLElement, theme: WidgetTheme, cb: UiCallbacks, locale: Locale = 'vi') {
    this.host = host;
    this.theme = theme;
    this.cb = cb;
    this.locale = locale;
    this.s = t(locale);
    this.timeFormatter = makeTimeFormatter(locale);
    const style = document.createElement('style');
    style.textContent = APP_CSS;
    document.head.appendChild(style);
    this.applyTheme(theme);
  }

  /** Đổi locale (loader chốt và gửi kèm message `session`) — gọi TRƯỚC khi render lại màn hình. */
  setLocale(locale: Locale) {
    this.locale = locale;
    this.s = t(locale);
    this.timeFormatter = makeTimeFormatter(locale);
  }

  applyTheme(theme: WidgetTheme) {
    this.theme = theme;
    const primary = theme.primary_color || '#1677ff';
    // Nền THẬT của mọi bề mặt có chữ là --lc-primary-strong (primary đã làm tối tới khi chữ đạt WCAG AA);
    // --lc-primary giữ đúng màu admin chọn cho chi tiết không có chữ (viền focus, highlight).
    const strong = primaryStrong(primary);
    const root = document.documentElement.style;
    root.setProperty('--lc-primary', primary);
    root.setProperty('--lc-primary-strong', strong);
    root.setProperty('--lc-on-primary', onPrimaryColor(strong));
    // 2 mức alpha, KHÔNG set thẳng --lc-primary-soft: inline style luôn thắng stylesheet nên CSS sẽ không
    // đổi được mức này theo chế độ tối. styles.ts chọn --lc-soft-12 (sáng) / --lc-soft-28 (tối).
    root.setProperty('--lc-soft-12', primarySoft(primary, 0.12));
    root.setProperty('--lc-soft-28', primarySoft(primary, 0.28));
    // v1.3.0 — chế độ sáng/tối: 'light'/'dark' ép cứng qua data-lc-scheme; 'auto' (mặc định) gỡ thuộc tính
    // để `@media (prefers-color-scheme)` của hệ điều hành quyết.
    const scheme = theme.color_scheme;
    if (scheme === 'light' || scheme === 'dark') document.documentElement.dataset.lcScheme = scheme;
    else delete document.documentElement.dataset.lcScheme;
    this.timeFormatter = makeTimeFormatter(this.locale);
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
      if (sub) sub.textContent = connected ? this.s.statusOnline : this.s.statusOffline;
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
      el.textContent = this.s.identifiedAs(this.identityDisplayName);
    } else if (el) {
      el.remove();
    }
  }

  private brandName(): string {
    return (this.theme.brand_name || this.theme.launcher_label || '').trim() || this.s.defaultBrand;
  }

  private safeLogoUrl(): string | null {
    return safeHttpsUrl(this.theme.logo_url);
  }

  /** Chữ cái đầu thương hiệu — dùng cho cả markup fallback lẫn fallback runtime khi ảnh lỗi tải. */
  private brandInitial(): string {
    return this.brandName().charAt(0).toUpperCase() || '?';
  }

  private logoHtml(size: number, solidFallback: boolean): string {
    const url = this.safeLogoUrl();
    const style = `width:${size}px;height:${size}px`;
    // data-lc-fb ghi lại kiểu fallback ĐÚNG NGỮ CẢNH (header nằm trên nền primary ⇒ nền mờ trắng; các chỗ
    // khác ⇒ nền primary đặc) để listener 'error' dựng lại đúng khối khi URL logo hỏng.
    if (url) {
      return `<img class="lc-logo" style="${style}" src="${escapeAttr(url)}" alt="" data-lc-fb="${solidFallback ? 'solid' : 'soft'}"/>`;
    }
    return `<div class="${logoFallbackCls(solidFallback)}" style="${style}">${escapeText(this.brandInitial())}</div>`;
  }

  /**
   * Logo hỏng (404, hotlink bị chặn, ảnh lỗi) → thay bằng khối chữ cái đầu CÙNG KÍCH THƯỚC, thay vì để lại
   * ô ảnh vỡ. Gắn sau MỖI lần render có `<img class="lc-logo">` (header/pre-chat/avatar nhóm) và cho cả
   * avatar campaign (.lc-preview-avatar). `{once:true}`: 1 ảnh chỉ thay 1 lần.
   */
  private wireImageFallbacks(scope: ParentNode = this.host, initialOverride?: string) {
    const initial = initialOverride || this.brandInitial();
    scope.querySelectorAll<HTMLImageElement>('img.lc-logo,img.lc-preview-avatar').forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          const div = document.createElement('div');
          if (img.classList.contains('lc-preview-avatar')) {
            div.className = 'lc-preview-avatar lc-preview-avatar-fallback';
          } else {
            div.className = logoFallbackCls(img.dataset.lcFb !== 'soft');
            // giữ nguyên class bổ sung do nơi gọi thêm vào (vd .lc-group-avatar cho avatar 24px)
            if (img.classList.contains('lc-group-avatar')) div.classList.add('lc-group-avatar');
          }
          div.style.cssText = img.style.cssText; // cùng width/height với ảnh vừa hỏng
          div.textContent = initial;
          img.replaceWith(div);
        },
        { once: true },
      );
    });
  }

  private header(): string {
    const brand = this.brandName();
    const subtitleRaw = (this.theme.subtitle || '').trim();
    const subtitle = subtitleRaw || (this.connected ? this.s.statusOnline : this.s.statusOffline);
    const dotCls = this.connected ? 'lc-dot lc-dot-on' : 'lc-dot';
    const identity = this.identityDisplayName
      ? `<div class="lc-identity">${escapeText(this.s.identifiedAs(this.identityDisplayName))}</div>`
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
        <button class="lc-x" type="button" aria-label="${escapeAttr(this.s.close)}">${xIcon()}</button>
      </div>
      ${identity}
    </div>`;
  }

  private footer(): string {
    // story-07 AC6 — bắt buộc, không có cờ tắt. footerHtml là HTML tĩnh (không biến), an toàn.
    return `<div class="lc-footer">${this.s.footerHtml}</div>`;
  }

  private wireClose() {
    this.host.querySelector<HTMLButtonElement>('.lc-x')?.addEventListener('click', () => this.cb.onClose());
    this.wireImageFallbacks(); // 4 màn (loading/offline/pre-chat/chat) đều đi qua đây sau khi set innerHTML
  }

  showLoading() {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${chatDots()}<div>${escapeText(this.s.connecting)}</div></div>
      ${this.footer()}</div>`;
    this.wireClose();
  }

  showOffline(text: string) {
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-center">${offlineIcon()}<div class="lc-off-text"></div></div>
      ${this.footer()}</div>`;
    this.host.querySelector<HTMLElement>('.lc-off-text')!.textContent =
      text || this.theme.offline_text || this.s.offlineDefault;
    this.wireClose();
  }

  showPreChat(cfg: PreChatForm, greeting: string) {
    const nameField = cfg.require_name
      ? field('lc-name', this.s.nameLabel, 'text', this.s.namePlaceholder, this.s.nameError)
      : '';
    const phoneField = cfg.require_phone
      ? field('lc-phone', this.s.phoneLabel, 'tel', this.s.phonePlaceholder, this.s.phoneError)
      : '';
    const phoneRegion = cfg.phone_region === 'INTL' ? 'INTL' : 'VN'; // BE cũ chưa gửi field ⇒ 'VN'
    const messageField = cfg.require_message
      ? field('lc-message', this.s.messageLabel, 'text', this.s.messagePlaceholder, this.s.messageError, true)
      : '';
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-prechat">
        <div class="lc-prechat-logo">${this.logoHtml(56, true)}</div>
        <p class="lc-greeting">${escapeText(greeting || this.theme.greeting_text)}</p>
        ${nameField}${phoneField}${messageField}
        <button class="lc-primary-btn" type="button" disabled>${escapeText(this.s.submitPreChat)}</button>
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
    const phoneValid = (v: string) => isValidPhone(v.trim(), phoneRegion);
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
      input.addEventListener('input', updateBtn);
      input.addEventListener('blur', () => setInvalid(input, !valid(input.value)));
    };
    wireField(nameInput, nameValid);
    wireField(phoneInput, phoneValid);
    wireField(messageInput, messageValid);

    const trySubmit = () => {
      let ok = true;
      const check = (input: HTMLInputElement | HTMLTextAreaElement | null, valid: (v: string) => boolean) => {
        if (!input) return;
        if (setInvalid(input, !valid(input.value))) ok = false;
      };
      check(nameInput, nameValid);
      check(phoneInput, phoneValid);
      check(messageInput, messageValid);
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = this.s.submitPreChatSending;
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
    const name = (campaign.sender?.name || siteFallbackName || this.s.defaultBrand).trim() || this.s.defaultBrand;
    const avatarUrl = safeHttpsUrl(campaign.sender?.avatar); // chỉ https, cùng luật với logo_url (AC8)
    const avatarHtml = avatarUrl
      ? `<img class="lc-preview-avatar" src="${escapeAttr(avatarUrl)}" alt=""/>`
      : `<div class="lc-preview-avatar lc-preview-avatar-fallback">${escapeText(name.charAt(0).toUpperCase() || '?')}</div>`;
    this.host.innerHTML = `<div class="lc-preview">
      <button class="lc-preview-x" type="button" aria-label="${escapeAttr(this.s.close)}">${xIcon()}</button>
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
    this.wireImageFallbacks(this.host, name.charAt(0).toUpperCase() || '?'); // avatar campaign: chữ đầu TÊN người gửi
    const el = this.host.querySelector<HTMLElement>('.lc-preview')!;
    return el.getBoundingClientRect().height || 96;
  }

  showChat(greeting: string) {
    this.greeting = greeting || this.theme.greeting_text;
    this.host.innerHTML = `<div class="lc-app">${this.header()}
      <div class="lc-body" role="log"></div>
      <div class="lc-sr" aria-live="polite" aria-atomic="true"></div>
      <div class="lc-composer">
        <textarea rows="1" placeholder="${escapeAttr(this.s.composerPlaceholder)}" aria-label="${escapeAttr(this.s.composerAriaLabel)}"></textarea>
        <button class="lc-send" type="button" aria-label="${escapeAttr(this.s.sendAriaLabel)}" disabled>${sendIcon()}</button>
      </div>
      ${this.footer()}</div>`;
    this.wireClose();
    this.bodyEl = this.host.querySelector<HTMLElement>('.lc-body');
    this.srEl = this.host.querySelector<HTMLElement>('.lc-sr');
    const ta = this.host.querySelector<HTMLTextAreaElement>('textarea')!;
    const send = this.host.querySelector<HTMLButtonElement>('.lc-send')!;

    const sync = () => {
      send.disabled = ta.value.trim().length === 0;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; // khớp max-height:120px trong styles.ts
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
    // Chỉ đọc TIN VỪA ĐẾN. Trước đây aria-live nằm trên .lc-body mà renderList() xoá trắng rồi dựng lại
    // toàn bộ ⇒ screen reader đọc lại cả cuộc hội thoại sau mỗi tin.
    if (this.srEl) this.srEl.textContent = sm.content ?? '';
  }

  /** Đưa con trỏ vào ô soạn tin (khi widget được mở — bàn phím phải tới thẳng chỗ gõ). */
  focusComposer() {
    this.host.querySelector<HTMLTextAreaElement>('.lc-composer textarea')?.focus();
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
    if (last.sentAt > 0) {
      const time = document.createElement('div');
      time.className = `lc-group-time${out ? ' lc-out' : ''}`;
      time.setAttribute('aria-hidden', 'true'); // nhiễu với screen reader; nội dung tin đã đọc qua .lc-sr
      const hhmm = this.timeFormatter.format(new Date(last.sentAt)); // sent_at = MILLISECOND (gotcha #7)
      if (out && last.status === 'sending') time.textContent = this.s.statusSending;
      else if (out && last.status === 'sent') time.textContent = `${this.s.statusSent} · ${hhmm}`;
      else time.textContent = hhmm;
      wrap.appendChild(time);
    }
    return wrap;
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
      el.addEventListener('click', () => this.cb.onRetry(echoId, text));
    }
    return el;
  }

  private avatarEl(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = this.logoHtml(24, true); // markup tự sinh (đã escape ở logoHtml) — an toàn gán innerHTML
    const el = wrap.firstElementChild as HTMLElement;
    el.classList.add('lc-group-avatar');
    this.wireImageFallbacks(wrap);
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

  /** Số tin staff chưa đọc (để loader hiện badge) — main tự đếm; UI không giữ trạng thái mở/đóng. */
  hasBody(): boolean {
    return this.bodyEl != null;
  }
}

// ── helpers ──
function field(id: string, label: string, type: string, ph: string, err: string, multiline = false): string {
  // a11y: ô nhập trỏ tới dòng lỗi qua aria-describedby (dòng lỗi LUÔN tồn tại — chỉ ẩn/hiện bằng
  // visibility, xem styles.ts) và mang aria-invalid khi sai; role="alert" để screen reader đọc lỗi.
  const attrs = `id="${id}" aria-describedby="${id}-err" aria-invalid="false"`;
  const control = multiline
    ? `<textarea ${attrs} rows="2" placeholder="${escapeAttr(ph)}"></textarea>`
    : `<input ${attrs} type="${type}" placeholder="${escapeAttr(ph)}" autocomplete="${type === 'tel' ? 'tel' : 'name'}"/>`;
  return `<div class="lc-field" id="${id}-field">
    <label for="${id}">${escapeText(label)}</label>
    ${control}
    <div class="lc-err" id="${id}-err" role="alert">${escapeText(err)}</div></div>`;
}

/** Bật/tắt trạng thái lỗi của 1 ô (class trên .lc-field + aria-invalid trên chính ô). Trả lại `bad`. */
function setInvalid(input: HTMLInputElement | HTMLTextAreaElement, bad: boolean): boolean {
  input.closest<HTMLElement>('.lc-field')?.classList.toggle('lc-invalid', bad);
  input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  return bad;
}

/** URL ảnh chỉ chấp nhận https (AC8) — dùng cho logo_url và avatar campaign. */
function safeHttpsUrl(raw: string | null | undefined): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

function logoFallbackCls(solid: boolean): string {
  return solid ? 'lc-logo lc-logo-fallback-solid' : 'lc-logo lc-logo-fallback';
}
function escapeText(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Giờ hiển thị theo locale — KHÔNG còn hằng module-level 'vi'.
function makeTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
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
