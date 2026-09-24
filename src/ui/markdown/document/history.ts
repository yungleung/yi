/**
 * The edit history: what changed, in the order it changed, with a cursor.
 *
 * An edit is a range replacement — the same shape every command already applies
 * to the text — and it is its own inverse with `removed` and `inserted`
 * exchanged, so undo needs no copy of the document and redo needs no extra
 * state. At any moment, replaying the edits below the cursor from the loaded
 * text reproduces the text in the editor; that property is what keeps the
 * history a derivation of the document rather than a second source of truth.
 *
 * May import: nothing. Upholds: an edit that is applied is recorded once, an
 * edit that is undone is applied as its inverse through the same path the
 * document already uses, and a new edit discards what redo would have replayed.
 */

/** One change to the document, in pre-edit offsets. */
export interface DocumentEdit {
  /** Where the change starts in the text it was made against. */
  from: number;
  /** Where it ends there; equal to `from` for an insertion. */
  to: number;
  /** The text that was removed; empty for an insertion. */
  removed: string;
  /** The text that took its place; empty for a deletion. */
  inserted: string;
  /** The caret the edit started from; absent when it was made without one. */
  caretBefore?: number;
  /** The caret the edit left behind; absent with `caretBefore`. */
  caretAfter?: number;
}

/** The edit that undoes `edit`. */
export function invert(edit: DocumentEdit): DocumentEdit {
  const inverted: DocumentEdit = {
    from: edit.from,
    to: edit.from + edit.inserted.length,
    removed: edit.inserted,
    inserted: edit.removed
  };
  // Undoing starts where the edit left off and leaves the caret where it began, so
  // the carets exchange with the text.
  if (edit.caretBefore !== undefined) {
    inverted.caretBefore = edit.caretAfter;
  }
  if (edit.caretAfter !== undefined) {
    inverted.caretAfter = edit.caretBefore;
  }
  return inverted;
}

/** What a keystroke was: a run of one kind becomes one undo step. */
export type EditKind = 'typing' | 'deleting' | 'other';

/** How many characters one run may hold, so a script without spaces still breaks. */
export const STEP_LIMIT = 24;

/** `\p{L}`: any script's letter, which is where a word ends and a step ends. */
const LETTER_LAST = /\p{L}$/u;

/**
 * The edit one step holds when `next` continues the run `previous` is in, or null
 * when the run ends here.
 *
 * A run is one kind of keystroke, adjacent in the direction that kind grows, and for
 * typing it is a word: the run ends *after* the first character that is not a letter,
 * so a space or a full stop belongs to the word it follows. A letter is `\p{L}` —
 * any script's — and a run longer than `limit` characters ends anyway, which is what
 * keeps a language that does not write spaces from making one step of a paragraph.
 * A multi-character insertion is never a run of typing: that is a paste, or an input
 * method committing a word, and either is a step of its own.
 */
export function coalesceRun(
  previous: DocumentEdit,
  next: DocumentEdit,
  kind: EditKind,
  limit: number = STEP_LIMIT
): DocumentEdit | null {
  if (kind === 'other') {
    return null;
  }
  if (kind === 'typing') {
    // The caret an insertion leaves sits just past its own text, which is where the
    // next keystroke types — not at the insertion's `to`, which is its `from`.
    const afterPrevious = previous.from + previous.inserted.length;
    if (previous.inserted === '' || next.from !== afterPrevious || next.to !== next.from) {
      return null;
    }
    if (next.inserted.length !== 1 || previous.inserted.length + 1 > limit) {
      return null;
    }
    if (!LETTER_LAST.test(previous.inserted)) {
      return null;
    }
    return {
      from: previous.from,
      to: previous.to,
      removed: previous.removed,
      inserted: `${previous.inserted}${next.inserted}`,
      ...caretsOf(previous, next)
    };
  }
  if (previous.inserted !== '' || next.inserted !== '') {
    return null;
  }
  // Backspace removes the character before the run, Delete the one after it: both
  // directions grow the run outwards from where it began.
  if (next.to === previous.from) {
    return {
      from: next.from,
      to: previous.to,
      removed: `${next.removed}${previous.removed}`,
      inserted: '',
      ...caretsOf(previous, next)
    };
  }
  // Delete removes at the caret, so its next edit removes the same range of what is
  // left: the run grows to the right, one character each time.
  if (next.from === previous.from && next.to === previous.to) {
    return {
      from: previous.from,
      to: previous.to + next.removed.length,
      removed: `${previous.removed}${next.removed}`,
      inserted: '',
      ...caretsOf(previous, next)
    };
  }
  return null;
}

/** A run's carets: the first edit's start, the last edit's end. */
function caretsOf(previous: DocumentEdit, next: DocumentEdit): {
  caretBefore?: number;
  caretAfter?: number;
} {
  return previous.caretBefore === undefined
    ? {}
    : { caretBefore: previous.caretBefore, caretAfter: next.caretAfter };
}

/** The log of edits, and where in it the document currently is. */
export class History {
  private readonly log: DocumentEdit[] = [];
  /** How many of the edits below are in force; the rest can be redone. */
  private cursor = 0;

  /** The kind of the last edit, so a new one knows whether it continues the run. */
  private lastKind: EditKind = 'other';

  /**
   * Records an edit the document has just applied, discarding the redo tail.
   *
   * An edit that continues the run the last one was in replaces it instead of being
   * pushed: a word of typing is one step (see `coalesceRun`).
   */
  record(edit: DocumentEdit, kind: EditKind = 'other'): void {
    const previous = this.cursor > 0 ? this.log[this.cursor - 1] : null;
    if (previous && kind === this.lastKind) {
      const merged = coalesceRun(previous, edit, kind);
      if (merged) {
        this.log[this.cursor - 1] = merged;
        return;
      }
    }
    this.lastKind = kind;
    this.log.splice(this.cursor);
    this.log.push(edit);
    this.cursor = this.log.length;
  }

  /** The inverse of the edit to undo, or null when there is nothing to undo. */
  undo(): DocumentEdit | null {
    if (this.cursor === 0) {
      return null;
    }
    this.cursor -= 1;
    return invert(this.log[this.cursor]);
  }

  /** The edit to redo, or null when there is nothing to redo. */
  redo(): DocumentEdit | null {
    if (this.cursor >= this.log.length) {
      return null;
    }
    const edit = this.log[this.cursor];
    this.cursor += 1;
    return edit;
  }

  /** Forgets every edit — a new document is not a continuation of the old one. */
  clear(): void {
    this.log.length = 0;
    this.cursor = 0;
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.log.length;
  }

  /** How many edits are recorded, redone ones included. */
  get length(): number {
    return this.log.length;
  }

  /** The edits in force, oldest first. */
  edits(): readonly DocumentEdit[] {
    return this.log.slice(0, this.cursor);
  }
}
