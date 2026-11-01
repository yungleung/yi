/**
 * Telling the reader that something happened, beside where it happened: a path copied, a name
 * copied, an id copied.
 *
 * A hint is the quiet surface — it is not asking the reader to act, so it does not wait for them:
 * it sits beside the row it is about and goes away as soon as they press anywhere else (or ask to
 * be rid of it with Escape). A failure, which does need attention, is a message instead
 * (`services/messages.ts`).
 *
 * Where a hint belongs travels as a *name*, never an element: the event bus is Tauri's (`emit`
 * serialises its payload), so a DOM node cannot ride it — and a workspace path is exactly what the
 * tree's rows are found by. `hintPlaceSelector` turns one into the selector the hint surface looks
 * for, escaping it first: a quote, a backslash or a newline in a file name must not break it.
 *
 * May import: the event manager. Upholds: one way to say "that worked", and one place where a
 * hint's home is written down.
 */

import { eventManager } from './events';

/** Where a hint belongs: the row of a workspace file. */
export interface HintPlace {
  path: string;
}

/** What the app says quietly. */
export interface Hint {
  text: string;
  /**
   * Beside what it happened on — or `null` when it happened on nothing in this window, in which
   * case the card takes the window's corner, which is where a card pointing at nothing has always
   * gone (`ui/floating/`). An export is the case: it worked, and the file it worked on
   * is not a row of the tree.
   */
  at: HintPlace | null;
}

/** Emitted with a `Hint` whenever the app has good news to get out of the way. */
export const HINT_EVENT = 'hint';

/** A CSS string: a quote, a backslash or a newline in a file name must not break the selector. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

/**
 * The selector a place is found by — the tree's row for that file. Pure: the surface does the
 * looking, this only says what to look for.
 */
export function hintPlaceSelector(place: HintPlace): string {
  return `[data-tree-path="${attributeValue(place.path)}"]`;
}

/** Something worked, and the reader only has to notice it — beside `at`, or in the corner. */
export function showHint(text: string, at: HintPlace | null): void {
  void eventManager.emit(HINT_EVENT, { text, at } satisfies Hint);
}
