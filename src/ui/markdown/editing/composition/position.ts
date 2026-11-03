/**
 * Places the invisible input-method textarea at the caret and draws its marked
 * text into the line.
 *
 * Example: moving the caret or scrolling the editor moves the native field so
 * the candidate window opens at the reader's caret rather than at the page's
 * corner.
 *
 * May import: the caret range/geometry and composition view. Upholds: plain
 * keystrokes do not measure layout; the editor frame is measured only initially,
 * on resize, or while the system is actively using the field.
 */

import { getCaretRange } from '../../caret/caret';
import { caretRect } from '../../caret/geometry';
import type { CompositionView } from './view';

export interface CompositionPositionOptions {
  readonly host: HTMLElement;
  readonly element: HTMLTextAreaElement;
  readonly clip: HTMLElement;
  readonly view: CompositionView;
  fieldInUse(): boolean;
}

export interface CompositionPosition {
  followCaret(): void;
  drawMarked(): void;
}

/**
 * Keeps the native composition field and its clip at the logical caret.
 *
 * Example: moving the caret to a new block moves the field there before the next
 * candidate window opens; scrolling repaints the marked text against the new frame.
 */
export function installCompositionPosition({
  host,
  element,
  clip,
  view,
  fieldInUse
}: CompositionPositionOptions): CompositionPosition {
  let frame = { left: 0, top: 0 };

  const measureFrame = (): void => {
    const rect = host.getBoundingClientRect();
    frame = { left: rect.left, top: rect.top };
    clip.style.left = `${rect.left}px`;
    clip.style.top = `${rect.top}px`;
    clip.style.width = `${rect.width}px`;
    clip.style.height = `${rect.height}px`;
  };
  requestAnimationFrame(measureFrame);
  window.addEventListener('resize', measureFrame);

  const followCaret = (): void => {
    const range = getCaretRange();
    const box = range ? caretRect(range) : null;
    if (!box) {
      element.style.left = '-1000px';
      element.style.top = '-1000px';
      return;
    }
    if (fieldInUse()) {
      measureFrame();
    }
    element.style.left = `${box.left - frame.left}px`;
    element.style.top = `${box.top - frame.top}px`;
  };

  const drawMarked = (): void => {
    view.show(element.value, getCaretRange());
    followCaret();
  };

  return { followCaret, drawMarked };
}
