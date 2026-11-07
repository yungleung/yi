/**
 * The app's appearance choice and the one place it becomes daisyUI's root theme.
 *
 * Example: `dark` sets `data-theme="dim"`, while `auto` removes the explicit theme so the
 * stylesheet follows the operating system's light/dark preference.
 *
 * May import: the config shape and the DOM root. Upholds: both windows use the same daisyUI
 * themes and an unknown stored value falls back to automatic.
 */

import type { AppConfig } from '../api/settings';

export type ThemeChoice = AppConfig['theme'];

export function themeFor(config: AppConfig | null): ThemeChoice {
  const chosen = config?.theme;
  return chosen === 'light' || chosen === 'dark' ? chosen : 'auto';
}

export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    delete root.dataset.theme;
    root.style.colorScheme = 'light dark';
    return;
  }
  root.dataset.theme = theme === 'light' ? 'winter' : 'dim';
  root.style.colorScheme = theme;
}
