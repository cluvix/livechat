// Màn pre-chat: form 3 ô (họ tên / SĐT / tin nhắn) theo cấu hình site, validate client-side, submit về
// callback `onSubmitPreChat`. BE vẫn là nguồn chân lý (422 nếu lệch) — validate ở đây chỉ để phản hồi nhanh.
import type { Dict } from '../../shared/strings';
import type { PreChatForm, WidgetTheme } from '../../shared/types';
import { logoHtml } from './brand';
import { escapeText, field } from './markup';

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

/** Bật/tắt trạng thái lỗi của 1 ô (class trên .lc-field + aria-invalid trên chính ô). Trả lại `bad`. */
export function setInvalid(input: HTMLInputElement | HTMLTextAreaElement, bad: boolean): boolean {
  input.closest<HTMLElement>('.lc-field')?.classList.toggle('lc-invalid', bad);
  input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  return bad;
}

type Input = HTMLInputElement | HTMLTextAreaElement | null;
type Validator = (v: string) => boolean;

export class PreChatView {
  constructor(
    private host: HTMLElement,
    private onSubmit: (name: string, phone: string, message: string) => void,
  ) {}

  /** Render form + gắn sự kiện. `headerHtml`/`footerHtml` do facade dựng (theme/strings dùng chung). */
  show(
    theme: WidgetTheme,
    s: Dict,
    cfg: PreChatForm,
    greeting: string,
    headerHtml: string,
    footerHtml: string,
    afterRender: () => void,
  ) {
    const nameField = cfg.require_name
      ? field('lc-name', s.nameLabel, 'text', s.namePlaceholder, s.nameError)
      : '';
    const phoneField = cfg.require_phone
      ? field('lc-phone', s.phoneLabel, 'tel', s.phonePlaceholder, s.phoneError)
      : '';
    const phoneRegion = cfg.phone_region === 'INTL' ? 'INTL' : 'VN'; // BE cũ chưa gửi field ⇒ 'VN'
    const messageField = cfg.require_message
      ? field('lc-message', s.messageLabel, 'text', s.messagePlaceholder, s.messageError, true)
      : '';
    this.host.innerHTML = `<div class="lc-app">${headerHtml}
      <div class="lc-prechat">
        <div class="lc-prechat-logo">${logoHtml(theme, s, 56, true)}</div>
        <p class="lc-greeting">${escapeText(greeting || theme.greeting_text)}</p>
        ${nameField}${phoneField}${messageField}
        <button class="lc-primary-btn" type="button" disabled>${escapeText(s.submitPreChat)}</button>
      </div>
      ${footerHtml}</div>`;
    afterRender();

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

    const wireField = (input: Input, valid: Validator) => {
      if (!input) return;
      input.addEventListener('input', updateBtn);
      input.addEventListener('blur', () => setInvalid(input, !valid(input.value)));
    };
    wireField(nameInput, nameValid);
    wireField(phoneInput, phoneValid);
    wireField(messageInput, messageValid);

    const trySubmit = () => {
      let ok = true;
      const check = (input: Input, valid: Validator) => {
        if (!input) return;
        if (setInvalid(input, !valid(input.value))) ok = false;
      };
      check(nameInput, nameValid);
      check(phoneInput, phoneValid);
      check(messageInput, messageValid);
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = s.submitPreChatSending;
      this.onSubmit(
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
}
