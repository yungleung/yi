/**
 * Keyboard hand-back rules for the input-method seam.
 *
 * Example: a click that places the caret returns the keyboard on the next
 * frame; ordinary typing keeps it without resetting the input context.
 *
 * May import: nothing. Upholds: app controls and live text selections keep
 * their focus, and only a field inside the editor may be handed back.
 */

/** The controls whose focus is their own: a field of the app's, never the page's. */
const CONTROLS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Whether the event target is an app control that must keep its own focus. */
export function isCompositionControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(CONTROLS);
}

/** Whether the reader is showing a selection that a focus change would drop. */
export function showingSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
}

/** Keeps ordinary typing in the field without a deliberate focus reset. */
export function keepCompositionKeyboard(
  element: HTMLTextAreaElement
): void {
  const active = document.activeElement;
  if (active === element) {
    return;
  }
  if (isCompositionControl(active)) {
    return;
  }
  if (showingSelection()) {
    return;
  }
  requestAnimationFrame(() => element.focus({ preventScroll: true }));
}

/**
 * Hands the field the keyboard again on the next frame after a structural edit
 * or caret placement.
 */
export function regainCompositionKeyboard(
  host: HTMLElement,
  element: HTMLTextAreaElement
): void {
  const active = document.activeElement;
  if (active !== element) {
    const inEditor = active instanceof Node && host.contains(active);
    if (!inEditor || isCompositionControl(active)) {
      return;
    }
  }
  if (showingSelection()) {
    return;
  }
  element.blur();
  requestAnimationFrame(() => element.focus({ preventScroll: true }));
}

/** Recreates the native field's focus context in the same turn. */
export function resetCompositionKeyboard(element: HTMLTextAreaElement): void {
  element.blur();
  element.focus({ preventScroll: true });
}
