/**
 * Which window chrome the current desktop should use.
 *
 * Example: `usesCustomTitleBar('windows')` is false, so the native frame owns
 * the title bar and window controls.
 *
 * May import: nothing. Upholds: Yi's overlay title bar is mounted only where
 * Tauri supports it, while Windows and Linux keep native window chrome.
 */

export function usesCustomTitleBar(platformName: string): boolean {
  return platformName.toLowerCase() === 'macos';
}
