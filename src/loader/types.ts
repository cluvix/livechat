// Kiểu dùng chung giữa các module loader + khai báo hợp đồng mở nguồn gắn lên `window`.

import type { WidgetIdentity } from '../shared/types';

/** Tên event public phát ra `window` (hợp đồng mở nguồn — arch §3.3). */
export type PublicEventName = 'ready' | 'opened' | 'closed' | 'message';

/** API công khai gắn vào `window.cluvixChat` (story-08 AC3). */
export interface CluvixChatApi {
  open(): void;
  close(): void;
  toggle(): void;
  setUser(user: unknown): void;
  on(name: PublicEventName, cb: EventListener): void;
  off(name: PublicEventName, cb: EventListener): void;
}

declare global {
  interface Window {
    cluvixChat?: CluvixChatApi;
  }
}

export interface Bootstrap {
  siteKey: string;
  apiBase: string; // origin backend — `data-host` nếu có, else origin nơi widget.js được serve
  identity: WidgetIdentity | null; // story-08 AC2 — identity ban đầu từ data-user-*
}
