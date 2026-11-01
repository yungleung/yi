/**
 * App-level shortcut and arrow-key handling for the editor.
 *
 * Example: Cmd/Ctrl+B resolves to `format:bold`, while an unmodified arrow moves the logical caret
 * and leaves the composition seam focused so the next Chinese key can begin composition.
 *
 * May import: the keymap, command runtime, caret navigation, selection root, editing context and
 * composition seam. Upholds: a chord runs a registered command, never a private editing function.
 */

import { ARROW_KEY_DIRECTIONS, moveCaret } from '../caret/navigation';
import { commandForKey } from '../../../commands/triggers/keymap';
import { runCommand } from '../../../commands/runtime';
import type { CompositionInput } from '../editing/composition_input';
import type { EditorContext } from '../editing/context';
import { proseRoot } from '../editing/selection';
import { getCaretRange } from '../caret/caret';

/** Runs the command bound to a keyboard chord, returning true when the chord was handled. */
export function handleEditorShortcut(event: KeyboardEvent): boolean {
  const command = commandForKey(event);
  if (!command) {
    return false;
  }
  event.preventDefault();
  runCommand(command, null, 'keyboard');
  return true;
}

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
