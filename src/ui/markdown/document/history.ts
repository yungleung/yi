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
}

/** The edit that undoes `edit`. */
export function invert(edit: DocumentEdit): DocumentEdit {
  return {
    from: edit.from,
    to: edit.from + edit.inserted.length,
    removed: edit.inserted,
    inserted: edit.removed
  };
}

/** The log of edits, and where in it the document currently is. */
export class History {
  private readonly log: DocumentEdit[] = [];
  /** How many of the edits below are in force; the rest can be redone. */
  private cursor = 0;

  /** Records an edit the document has just applied, discarding the redo tail. */
  record(edit: DocumentEdit): void {
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
