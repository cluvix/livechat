// UI iframe app: header (thương hiệu) + vùng tin + composer + pre-chat form + trạng thái offline/loading +
// footer bắt buộc (story-07 UI v2). An toàn XSS: mọi nội dung động render bằng textContent/escapeText/
// escapeAttr (KHÔNG innerHTML) — content staff/visitor/theme không tin cậy (story-07 AC8). Ngoại lệ duy
// nhất: `logo_url` chỉ gán vào `src` sau khi xác nhận `protocol === 'https:'` (safeHttpsUrl), và
// `footerHtml` là HTML tĩnh KHÔNG chứa biến/config nên an toàn gán thẳng.
//
// File này là FACADE mỏng: giữ nguyên hợp đồng public với main.ts, còn phần dựng/điều khiển từng vùng nằm
// ở `./ui/` (markup, brand, prechat, chat-list, composer, preview).
import { t, type Dict, type Locale } from '../shared/strings';
import { onPrimaryColor, primarySoft, primaryStrong } from '../shared/color';
import type { CampaignPreview, PreChatForm, WidgetMessage, WidgetTheme } from '../shared/types';
import { brandInitial, footer, header, wireImageFallbacks } from './ui/brand';
import { ChatList, makeTimeFormatter } from './ui/chat-list';
import { Composer, focusComposer } from './ui/composer';
import { chatDots, escapeAttr, escapeText, injectAppCss, offlineIcon, sendIcon } from './ui/markup';
import { PreChatView } from './ui/prechat';
import { showCampaignPreview } from './ui/preview';
import type { CampaignPreviewCallbacks, UiCallbacks } from './ui/types';

export type { CampaignPreviewCallbacks, UiCallbacks } from './ui/types';
export { isValidPhone } from './ui/prechat';

export class WidgetUI {
  private host: HTMLElement;
  private theme: WidgetTheme;
  private cb: UiCallbacks;
  private locale: Locale;
  private s: Dict;
  private timeFormatter: Intl.DateTimeFormat;

  private list: ChatList;
  private prechat: PreChatView;
  private composer: Composer;
  private connected = false; // story-07 AC2 — chấm trạng thái header, cập nhật qua setConnected()
  private identityDisplayName = ''; // story-07 AC7

  constructor(host: HTMLElement, theme: WidgetTheme, cb: UiCallbacks, locale: Locale = 'vi') {
    this.host = host;
    this.theme = theme;
    this.cb = cb;
    this.locale = locale;
    this.s = t(locale);
    this.timeFormatter = makeTimeFormatter(locale);
    this.list = new ChatList(theme, this.s, this.timeFormatter, (echoId, text) => cb.onRetry(echoId, text));
    this.prechat = new PreChatView(host, (name, phone, message) => cb.onSubmitPreChat(name, phone, message));
    this.composer = new Composer(host, (text) => cb.onSend(text), () => cb.onTyping());
    injectAppCss();
    this.applyTheme(theme);
  }

  /** Đổi locale (loader chốt và gửi kèm message `session`) — gọi TRƯỚC khi render lại màn hình. */
  setLocale(locale: Locale) {
    this.locale = locale;
    this.s = t(locale);
    this.timeFormatter = makeTimeFormatter(locale);
    this.list.setStrings(this.s, this.timeFormatter);
  }

  applyTheme(theme: WidgetTheme) {
    this.theme = theme;
    this.list.setTheme(theme);
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
    this.list.setStrings(this.s, this.timeFormatter);
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

  private hdr(): string {
    return header(this.theme, this.s, this.connected, this.identityDisplayName);
  }

  private wireClose() {
    this.host.querySelector<HTMLButtonElement>('.lc-x')?.addEventListener('click', () => this.cb.onClose());
    // 4 màn (loading/offline/pre-chat/chat) đều đi qua đây sau khi set innerHTML
    wireImageFallbacks(this.host, brandInitial(this.theme, this.s));
  }

  showLoading() {
    this.host.innerHTML = `<div class="lc-app">${this.hdr()}
      <div class="lc-center">${chatDots()}<div>${escapeText(this.s.connecting)}</div></div>
      ${footer(this.s)}</div>`;
    this.wireClose();
  }

  showOffline(text: string) {
    this.host.innerHTML = `<div class="lc-app">${this.hdr()}
      <div class="lc-center">${offlineIcon()}<div class="lc-off-text"></div></div>
      ${footer(this.s)}</div>`;
    this.host.querySelector<HTMLElement>('.lc-off-text')!.textContent =
      text || this.theme.offline_text || this.s.offlineDefault;
    this.wireClose();
  }

  showPreChat(cfg: PreChatForm, greeting: string) {
    this.prechat.show(this.theme, this.s, cfg, greeting, this.hdr(), footer(this.s), () => this.wireClose());
  }

  showCampaignPreview(campaign: CampaignPreview, siteFallbackName: string, cb: CampaignPreviewCallbacks): number {
    return showCampaignPreview(this.host, this.s, campaign, siteFallbackName, cb);
  }

  showChat(greeting: string) {
    this.host.innerHTML = `<div class="lc-app">${this.hdr()}
      <div class="lc-body" role="log"></div>
      <div class="lc-sr" aria-live="polite" aria-atomic="true"></div>
      <div class="lc-composer">
        <textarea rows="1" placeholder="${escapeAttr(this.s.composerPlaceholder)}" aria-label="${escapeAttr(this.s.composerAriaLabel)}"></textarea>
        <button class="lc-send" type="button" aria-label="${escapeAttr(this.s.sendAriaLabel)}" disabled>${sendIcon()}</button>
      </div>
      ${footer(this.s)}</div>`;
    this.wireClose();
    this.composer.mount();
    this.list.mount(
      this.host.querySelector<HTMLElement>('.lc-body'),
      this.host.querySelector<HTMLElement>('.lc-sr'),
      greeting || this.theme.greeting_text,
    );
  }

  /** Đưa con trỏ vào ô soạn tin (khi widget được mở — bàn phím phải tới thẳng chỗ gõ). */
  focusComposer() {
    focusComposer(this.host);
  }

  // ── uỷ quyền sang ChatList ──
  setHistory(msgs: WidgetMessage[]) { this.list.setHistory(msgs); }
  addIncoming(sm: WidgetMessage) { this.list.addIncoming(sm); }
  addOptimistic(echoId: string, text: string) { this.list.addOptimistic(echoId, text); }
  markSending(echoId: string) { this.list.markSending(echoId); }
  markFailed(echoId: string) { this.list.markFailed(echoId); }
  ackOptimistic(echoId: string, sm: WidgetMessage) { this.list.ackOptimistic(echoId, sm); }
  showStaffTyping() { this.list.showStaffTyping(); }
  hideStaffTyping() { this.list.hideStaffTyping(); }

  /** Số tin staff chưa đọc (để loader hiện badge) — main tự đếm; UI không giữ trạng thái mở/đóng. */
  hasBody(): boolean {
    return this.list.hasBody();
  }
}
