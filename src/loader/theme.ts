// Áp theme (màu, vị trí, nhãn, locale) lên nút mở chat + vẽ badge unread. Tách khỏi frame.ts vì đây là
// phép biến đổi thuần "state + DOM đã có" → thuộc tính CSS/ARIA, không dính luồng mở/đóng khung.

import { pickLocale, t } from '../shared/strings';
import { onPrimaryColor, primaryStrong } from '../shared/color';
import type { WidgetTheme } from '../shared/types';
import { offsetPx, shadowCss } from './css';
import type { FrameDom } from './frame-dom';
import type { LoaderState } from './state';

export function applyThemeToLauncher(state: LoaderState, dom: FrameDom, theme: WidgetTheme) {
  state.locale = pickLocale({ themeLocale: theme.locale, htmlLang: state.htmlLang, navigatorLang: state.navLang });
  state.S = t(state.locale);
  // Nền nút = primary ĐÃ làm tối tới ngưỡng WCAG AA; chữ/outline = màu đối lập tính theo contrast thật.
  const strong = primaryStrong(theme.primary_color);
  const onPrimary = onPrimaryColor(strong);
  const scheme = theme.color_scheme === 'light' || theme.color_scheme === 'dark' ? theme.color_scheme : 'auto';
  dom.style.textContent = shadowCss(
    theme.primary_color,
    theme.position === 'left',
    onPrimary,
    strong,
    scheme,
    offsetPx(theme.launcher_offset_x),
    offsetPx(theme.launcher_offset_y),
  );
  const label = (theme.launcher_label || '').trim() || state.S.launcherDefault;
  dom.launcherLabelEl.textContent = label; // textContent — theme là dữ liệu admin, không innerHTML
  dom.launcher.setAttribute('aria-label', `${state.S.openChat}: ${label}`);
  dom.launcher.title = label;
  dom.frameWrap.setAttribute('aria-label', label);
  if (state.iframe) state.iframe.title = state.S.frameTitle;
}

export function renderBadge(state: LoaderState, badgeEl: HTMLSpanElement) {
  if (state.unread > 0) {
    badgeEl.hidden = false;
    badgeEl.textContent = state.unread > 9 ? '9+' : String(state.unread);
  } else {
    badgeEl.hidden = true;
  }
}
