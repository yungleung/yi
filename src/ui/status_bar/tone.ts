/**
 * The status bar's three meaningful tones.
 *
 * Example: a saved document is green, an edited one amber and an unavailable state muted;
 * applying a new tone replaces the old one rather than accumulating classes.
 *
 * May import: the DOM only. Upholds: one status tone is present at a time.
 */

export type StatusTone = 'success' | 'warning' | 'muted';

const STATUS_TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-base-content/60'
};

/** Sets the one state colour a status has, replacing the previous one rather than adding to it. */
export function setStatusTone(element: HTMLElement, next: StatusTone): void {
  for (const className of Object.values(STATUS_TONE_CLASSES)) {
    element.classList.remove(className);
  }
  element.classList.add(STATUS_TONE_CLASSES[next]);
  element.dataset.tone = next;
}
