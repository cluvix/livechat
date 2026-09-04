// Dựng cây DOM của loader trong Shadow DOM (cô lập CSS 2 chiều với trang khách). Chỉ TẠO phần tử —
// mọi hành vi (mở/đóng, theme, badge) nằm ở frame.ts.

import { chatIcon, shadowCss } from './css';
import type { LoaderState } from './state';

export interface FrameDom {
  host: HTMLDivElement;
  style: HTMLStyleElement;
  launcher: HTMLButtonElement;
  launcherLabelEl: HTMLSpanElement;
  frameWrap: HTMLDivElement;
  badgeEl: HTMLSpanElement;
}

export function buildFrameDom(state: LoaderState): FrameDom {
  // z-index rất cao để nổi trên mọi lớp của trang khách; host không chiếm chỗ (width/height 0).
  const host = document.createElement('div');
  host.setAttribute('data-cluvix-livechat', '');
  host.style.cssText = 'position:fixed;z-index:2147483000;top:0;left:0;width:0;height:0;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = shadowCss();
  root.appendChild(style);

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'lc-launcher';
  // aria-label = động từ + nhãn ("Mở khung chat: Tư vấn") — chỉ nhãn thương hiệu thì screen reader không
  // biết bấm vào sẽ xảy ra gì. aria-expanded/aria-haspopup mô tả quan hệ với khung chat (dialog).
  launcher.setAttribute('aria-label', `${state.S.openChat}: ${state.S.launcherDefault}`);
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  // Pill icon + chữ (mặc định theo locale, admin đổi qua theme.launcher_label) — chỉ icon thì khách không
  // biết đó là gì. Khi khung mở, nút ẩn hẳn (CSS .lc-launcher.lc-open{display:none}).
  launcher.innerHTML = `${chatIcon()}<span class="lc-launcher-label"></span><span class="lc-badge" hidden></span>`;
  const launcherLabelEl = launcher.querySelector<HTMLSpanElement>('.lc-launcher-label')!;
  launcherLabelEl.textContent = state.S.launcherDefault;
  root.appendChild(launcher);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'lc-frame-wrap';
  frameWrap.hidden = true;
  frameWrap.setAttribute('role', 'dialog');
  frameWrap.setAttribute('aria-label', state.S.launcherDefault);
  root.appendChild(frameWrap);

  const badgeEl = launcher.querySelector<HTMLSpanElement>('.lc-badge')!;
  return { host, style, launcher, launcherLabelEl, frameWrap, badgeEl };
}
