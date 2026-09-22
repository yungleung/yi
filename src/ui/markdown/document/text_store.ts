/**
 * The document text as a piece table: the text it was loaded with, an
 * append-only buffer of everything inserted since, and the pieces that name
 * ranges of those two buffers in order.
 *
 * An edit cuts at its two ends, drops the pieces between them and adds one piece
 * for what was inserted — appended to the buffer, so text that already exists is
 * never copied and a keystroke costs the piece it touches rather than the
 * document. Adjacent pieces of one buffer coalesce, which is what keeps typing
 * two pieces long instead of one per character. `compact()` trades the retention
 * back for a fresh table when the replaced text is no longer worth keeping.
 *
 * May import: nothing. Upholds: the text *is* the pieces — every read is computed
 * from them, and nothing keeps a second copy that could disagree with them.
 */

/** A view of `length` characters of one buffer, starting `start` characters in. */
interface Piece {
  buffer: 'original' | 'added';
  start: number;
  length: number;
}

export class TextStore {
  private original: string;
  private added = '';
  private pieces: Piece[];
  /** The end offset of each piece; rebuilt when dirty, so a read is a search. */
  private ends: number[] = [];
  private dirty = false;

  constructor(text = '') {
    this.original = text;
    this.pieces = text.length > 0 ? [{ buffer: 'original', start: 0, length: text.length }] : [];
  }

  /** The length of the text, in characters. */
  get length(): number {
    const ends = this.pieceEnds();
    return ends.length === 0 ? 0 : ends[ends.length - 1];
  }

  /** How many pieces the table holds — what "incremental" looks like from outside. */
  pieceCount(): number {
    return this.pieces.length;
  }

  /** The text in `[from, to)`, clamped to the document. */
  slice(from: number, to: number): string {
    const length = this.length;
    const start = Math.max(0, Math.min(from, length));
    const end = Math.max(start, Math.min(to, length));
    if (start === end) {
      return '';
    }
    const ends = this.pieceEnds();
    let index = pieceAt(ends, start);
    let offset = start;
    let text = '';
    while (offset < end && index < this.pieces.length) {
      const piece = this.pieces[index];
      const within = offset - (ends[index] - piece.length);
      const take = Math.min(piece.length - within, end - offset);
      text += bufferOf(this.original, this.added, piece).slice(piece.start + within, piece.start + within + take);
      offset += take;
      index += 1;
    }
    return text;
  }

  /** The whole text, read out of the pieces rather than kept beside them. */
  toString(): string {
    return this.slice(0, this.length);
  }

  /** Replaces `[from, to)` with `replacement`, clamped to the document. */
  replace(from: number, to: number, replacement: string): void {
    const length = this.length;
    const start = Math.max(0, Math.min(from, length));
    const end = Math.max(start, Math.min(to, length));
    const ends = this.pieceEnds();
    const next: Piece[] = [];
    let index = 0;
    // Everything above the edit, and the head of the piece it starts inside.
    for (; index < this.pieces.length; index += 1) {
      const pieceStart = ends[index] - this.pieces[index].length;
      if (ends[index] <= start) {
        next.push(this.pieces[index]);
        continue;
      }
      if (pieceStart < start) {
        next.push({ ...this.pieces[index], length: start - pieceStart });
      }
      break;
    }
    if (replacement.length > 0) {
      next.push({ buffer: 'added', start: this.added.length, length: replacement.length });
      this.added += replacement;
    }
    // Everything below the edit, and the tail of the piece it ends inside.
    for (; index < this.pieces.length; index += 1) {
      const piece = this.pieces[index];
      const pieceStart = ends[index] - piece.length;
      if (ends[index] <= end) {
        continue;
      }
      if (pieceStart < end) {
        const trimmed = end - pieceStart;
        next.push({ ...piece, start: piece.start + trimmed, length: piece.length - trimmed });
        continue;
      }
      next.push(piece);
    }
    this.pieces = coalesce(next);
    this.dirty = true;
  }

  /**
   * Rebuilds the table with the current text as its `original` and an empty
   * `added`, which drops the text earlier edits replaced. Whole-document
   * rewrites (`state.setText`, from formatting and find-and-replace-all) leave
   * one behind, so this is what keeps a long session from holding several copies.
   */
  compact(): void {
    const text = this.toString();
    this.original = text;
    this.added = '';
    this.pieces = text.length > 0 ? [{ buffer: 'original', start: 0, length: text.length }] : [];
    this.dirty = true;
  }

  /** The end offset of each piece, rebuilt when the pieces have changed. */
  private pieceEnds(): number[] {
    if (this.dirty || this.ends.length !== this.pieces.length) {
      let total = 0;
      this.ends = this.pieces.map((piece) => (total += piece.length));
      this.dirty = false;
    }
    return this.ends;
  }
}

/** The buffer a piece names. */
function bufferOf(original: string, added: string, piece: Piece): string {
  return piece.buffer === 'original' ? original : added;
}

/** The index of the piece holding `offset` (the ends are ascending). */
function pieceAt(ends: readonly number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, ends.length - 1);
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ends[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Merges pieces that are next to each other in the same buffer. */
function coalesce(pieces: readonly Piece[]): Piece[] {
  const merged: Piece[] = [];
  for (const piece of pieces) {
    if (piece.length === 0) {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && last.buffer === piece.buffer && last.start + last.length === piece.start) {
      last.length += piece.length;
      continue;
    }
    merged.push({ ...piece });
  }
  return merged;
}
