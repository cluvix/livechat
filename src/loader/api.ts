// story-08 AC3: `window.cluvixChat` — hợp đồng mở nguồn với trang khách. Lệnh gọi TRƯỚC khi mount xong
// được xếp hàng (pendingApiCalls) và chạy ngay sau khi phát `ready`: trang khách nhúng script async nên
// rất dễ gọi cluvixChat.open() sớm hơn DOMContentLoaded.

import type { LoaderState } from './state';
import type { FrameController } from './frame';
import type { SessionController } from './session';
import type { CluvixChatApi } from './types';

export function createApi(state: LoaderState, frame: FrameController, session: SessionController): CluvixChatApi {
  const runOrQueue = (fn: () => void) => {
    if (state.mounted) fn();
    else state.pendingApiCalls.push(fn);
  };
  return {
    open: () => runOrQueue(() => frame.open()),
    close: () => runOrQueue(() => frame.close()),
    toggle: () => runOrQueue(() => (state.isOpen ? frame.close() : frame.open())),
    setUser: (u: unknown) => runOrQueue(() => session.setUser(u)),
    on: (name, cb) => window.addEventListener(`cluvix-chat:${name}`, cb),
    off: (name, cb) => window.removeEventListener(`cluvix-chat:${name}`, cb),
  };
}
