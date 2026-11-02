/**
 * Arrow-key handling for the editor.
 *
 * Example: an unmodified ArrowRight moves the logical caret and leaves the
 * composition seam focused so the next Chinese key can begin composition.
 *
 * May import: caret navigation, the selection root, editing context and the
 * composition seam. Upholds: arrow handling owns no command vocabulary; command
 * chords enter through `MarkdownHost.commands`.
 */

import { ARROW_KEY_DIRECTIONS, moveCaret } from '../caret/navigation';
import type { CompositionInput } from '../editing/composition';
import type { EditorContext } from '../editing/context';
import { proseRoot } from '../editing/selection';
import { getCaretRange } from '../caret/caret';

/**
 * Moves the caret for an arrow key after the text path has declined it.
 *
 * Example: ArrowRight advances one logical character; Shift+ArrowRight preserves the extending
 * native selection while the caret still hands the next keystroke back to the input method.
 */
export function handleArrowKey(
  context: EditorContext,
  composition: CompositionInput,
  event: KeyboardEvent
): void {
  const direction = ARROW_KEY_DIRECTIONS[event.key];
  if (!direction || !getCaretRange()) {
    return;
  }
  event.preventDefault();
  if (!event.shiftKey) {
    window.getSelection()?.removeAllRanges();
  }
  const root = proseRoot(context);
  if (root) {
    moveCaret(root, direction);
    composition.regainKeyboard();
  }
}
