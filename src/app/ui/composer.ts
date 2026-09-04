// Ô soạn tin: tự giãn chiều cao, bật/tắt nút gửi theo nội dung, Enter = gửi (Shift+Enter xuống dòng),
// báo `onTyping` mỗi lần gõ (throttle nằm ở main.ts — UI không giữ nhịp).

/** Đưa con trỏ vào ô soạn tin (khi widget được mở — bàn phím phải tới thẳng chỗ gõ). */
export function focusComposer(host: HTMLElement) {
  host.querySelector<HTMLTextAreaElement>('.lc-composer textarea')?.focus();
}

export class Composer {
  constructor(
    private host: HTMLElement,
    private onSend: (text: string) => void,
    private onTyping: () => void,
  ) {}

  /** Gắn sự kiện vào DOM composer vừa render bởi facade (showChat). */
  mount() {
    const ta = this.host.querySelector<HTMLTextAreaElement>('textarea')!;
    const send = this.host.querySelector<HTMLButtonElement>('.lc-send')!;

    const sync = () => {
      send.disabled = ta.value.trim().length === 0;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; // khớp max-height:120px trong styles.ts
    };
    ta.addEventListener('input', () => {
      sync();
      this.onTyping();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.fireSend(ta);
      }
    });
    send.addEventListener('click', () => this.fireSend(ta));
  }

  private fireSend(ta: HTMLTextAreaElement) {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = 'auto';
    this.host.querySelector<HTMLButtonElement>('.lc-send')!.disabled = true;
    this.onSend(text);
  }
}
