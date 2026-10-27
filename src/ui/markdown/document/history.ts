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

/**
 * Where an edit's author stood, and where the edit left them: a caret is a mark whose
 * two ends meet, a selection is the range the author had. Undo puts the mark its edit
 * started from back, so an edit that replaced a selection gets the selection returned
 * rather than a caret at the start of it (see `markdown_editor.ts: applyHistory`).
 */
export interface EditMark {
  from: number;
  to: number;
}

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
  /** Where the author was; absent when the edit was made without a caret. */
  before?: EditMark;
  /**
   * Where the edit left the author; absent when the edit has nowhere in particular to
   * leave them — a whole-document command whose text is gone, so there is nothing to put
   * a caret back on (see `find_controller.ts: replaceAll`). An undo of such an edit still
   * uses the mark it does carry.
   */
  after?: EditMark;
}

/** The edit that undoes `edit`. */
export function invert(edit: DocumentEdit): DocumentEdit {
  const inverted: DocumentEdit = {
    from: edit.from,
    to: edit.from + edit.inserted.length,
    removed: edit.inserted,
    inserted: edit.removed
  };
  // Undoing starts where the edit left off and leaves the author where they began, so
  // the marks exchange with the text — and a selection stays a selection, because the
  // swap moves whole marks rather than the two ends separately.
  if (edit.before !== undefined || edit.after !== undefined) {
    inverted.before = edit.after;
    inverted.after = edit.before;
  }
  return inverted;
}

/**
 * What an edit was: consecutive keystrokes of one kind can become one undo step.
 *
 * A `commit` is the system handing over a complete word from an input method,
 * dictation or the emoji panel. It is one history step of its own, like `other`, but
 * unlike other commands it is ordinary text input and must keep the keyboard seam.
 */
export type EditKind = 'typing' | 'deleting' | 'commit' | 'other';

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
  if (kind === 'other' || kind === 'commit') {
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
      ...marksOf(previous, next)
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
      ...marksOf(previous, next)
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
      ...marksOf(previous, next)
    };
  }
  return null;
}

/**
 * The typing run a Backspace takes one character back off, or null when it does not.
 *
 * Typing a word and deleting part of it again is one thing the author did, so the
 * deletion does not start a step of its own — it shortens the run, and a run it
 * shortens to nothing is no step at all (`History.record` drops it). What makes the
 * character the run's own is all three of: the deletion sits at the run's *end*, it
 * removes exactly the character that is there, and that character is the last one the
 * run inserted. So a Backspace that reaches past the run into the document's own text
 * — including the one that follows a run already trimmed away — a Delete, a paste, and
 * a caret that moved are all steps of their own.
 */
export function trimRun(previous: DocumentEdit, next: DocumentEdit): DocumentEdit | null {
  if (previous.inserted === '' || next.inserted !== '' || next.removed === '') {
    return null;
  }
  const end = previous.from + previous.inserted.length;
  if (next.from !== end - 1 || next.to !== end) {
    return null;
  }
  if (next.removed !== previous.inserted.slice(-1)) {
    return null;
  }
  return {
    from: previous.from,
    to: previous.to,
    removed: previous.removed,
    inserted: previous.inserted.slice(0, -1),
    ...marksOf(previous, next)
  };
}

/** A run's marks: where the first edit found the author, where the last one left them. */
function marksOf(previous: DocumentEdit, next: DocumentEdit): {
  before?: EditMark;
  after?: EditMark;
} {
  return previous.before === undefined
    ? {}
    : { before: previous.before, after: next.after };
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
   * pushed: a word of typing is one step (see `coalesceRun`), and a Backspace that
   * takes back the run's own last character trims that step rather than starting one
   * (see `trimRun`). A step a trim leaves empty was not an edit at all, so it is
   * dropped and the burst leaves no trace in the log.
   */
  record(edit: DocumentEdit, kind: EditKind = 'other'): void {
    const previous = this.cursor > 0 ? this.log[this.cursor - 1] : null;
    if (previous) {
      const merged =
        kind === this.lastKind
          ? coalesceRun(previous, edit, kind)
          : this.lastKind === 'typing' && kind === 'deleting'
            ? trimRun(previous, edit)
            : null;
      if (merged) {
        if (merged.inserted === '' && merged.removed === '') {
          // The run took back the last of its own text: the burst ends up having
          // changed nothing, so the step it was — and anything a redo would have
          // replayed after it — goes with it.
          this.log.splice(this.cursor - 1);
          this.cursor -= 1;
          this.lastKind = 'other';
          return;
        }
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
