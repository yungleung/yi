/**
 * Where the blocks are, kept as arithmetic rather than written on every block.
 *
 * A block starts one stride after the block before it, where a stride is the block's
 * own length plus the gap to the next one — the blank lines between them, and the
 * line ending that ends the block's own last line. (Blocks do not tile the text: a
 * blank line is a block of no characters, and the newlines between blocks belong to
 * no block. `state.ts: validateBlocks` says the same thing from the other side.)
 * Keeping the sums here is what lets an edit move every block below it without
 * touching any of them: a Fenwick tree over the strides and another over the line
 * spans answer a point update and a prefix sum in O(log blocks) each, where
 * rewriting the tail was O(blocks) per keystroke.
 *
 * May import: nothing. Upholds: one fact about where a block sits has one home, this
 * one, and it holds only counts a caller gave it — a block's own text stays the only
 * source of its length.
 */

/** How much of the document one block is worth, and what sits between them. */
export interface BlockEntry {
  /** The block's own length, in characters. */
  readonly length: number;
  /** How many lines the block spans, at least one. */
  readonly span: number;
  /**
   * The characters between this block's end and the next block's start: the line
   * ending that closes its last line, and any blank lines between them. Zero for the
   * last block of the document.
   */
  readonly gap: number;
}

/** An entry, and the block it belongs to. */
export interface IndexedEntry extends BlockEntry {
  readonly key: object;
}

export class BlockIndex {
  private keys: object[] = [];
  /** Fenwick trees, 1-based: the strides of the blocks, and their line spans. */
  private strides: number[] = [];
  private spans: number[] = [];
  private readonly entries = new WeakMap<object, BlockEntry>();
  private readonly positions = new WeakMap<object, number>();

  constructor(entries: readonly IndexedEntry[] = []) {
    for (const entry of entries) {
      this.set(entry.key, entry);
    }
    this.rebuild(entries.map((entry) => entry.key));
  }

  /** How many blocks the index holds. */
  get size(): number {
    return this.keys.length;
  }

  /**
   * Replaces whatever sits at `position` with this block, moving the sums after it.
   * The block it replaces is forgotten — it is not in the document any more, and
   * answering for it would name a position that is not its own.
   *
   * A list that grew or shrank is `rebuild`'s: a position past the end is out of
   * range here, and does nothing.
   */
  place(position: number, key: object, entry: BlockEntry): void {
    if (this.keys.length === 0 || position < 0 || position >= this.keys.length) {
      return;
    }
    const replaced = this.keys[position];
    const previous = this.entries.get(replaced);
    if (replaced !== key) {
      this.entries.delete(replaced);
      this.positions.delete(replaced);
    }
    this.keys[position] = key;
    this.entries.set(key, entry);
    this.positions.set(key, position);
    this.add(this.strides, position, strideOf(entry) - (previous ? strideOf(previous) : 0));
    this.add(this.spans, position, entry.span - (previous ? previous.span : 0));
  }

  /**
   * Remembers what a block is worth without placing it yet — for a block that is
   * about to arrive past the end of a list that has to be rebuilt.
   */
  set(key: object, entry: BlockEntry): void {
    this.entries.set(key, entry);
  }

  /**
   * Recomputes every sum and every position from these blocks, in this order, out of
   * the entries they were remembered with. This is the structural case: the list
   * changed length, so the blocks after the change have no old position to keep.
   */
  rebuild(keys: readonly object[]): void {
    this.keys = [...keys];
    this.strides = new Array(keys.length + 1).fill(0);
    this.spans = new Array(keys.length + 1).fill(0);
    for (let at = 0; at < keys.length; at += 1) {
      const entry = this.entryOf(keys[at]);
      this.positions.set(keys[at], at);
      this.add(this.strides, at, strideOf(entry));
      this.add(this.spans, at, entry.span);
    }
  }

  /** The document offset the block at `position` starts at. */
  startAt(position: number): number {
    return this.prefix(this.strides, this.clamp(position, this.strides));
  }

  /** The document offset just past the block at `position`. */
  endAt(position: number): number {
    return this.startAt(position) + this.lengthAt(position);
  }

  /** The 1-based line the block at `position` starts on. */
  lineAt(position: number): number {
    return 1 + this.prefix(this.spans, this.clamp(position, this.spans));
  }

  /** The 1-based line the block at `position` ends on. */
  endLineAt(position: number): number {
    return this.lineAt(position) + this.entryAt(position).span - 1;
  }

  /** The same four, asked about a block. */
  startOf(key: object): number {
    return this.startAt(this.positionOf(key));
  }

  endOf(key: object): number {
    return this.startOf(key) + this.entryOf(key).length;
  }

  lineOf(key: object): number {
    return this.lineAt(this.positionOf(key));
  }

  endLineOf(key: object): number {
    return this.endLineAt(this.positionOf(key));
  }

  /** Where a block sits, or an error: a block this index does not hold has no place. */
  private positionOf(key: object): number {
    const at = this.positions.get(key);
    if (at === undefined) {
      throw new Error('this block is not in the index');
    }
    return at;
  }

  private entryOf(key: object): BlockEntry {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error('this block is not in the index');
    }
    return entry;
  }

  private entryAt(position: number): BlockEntry {
    const key = this.keys[this.clamp(position, this.strides)];
    return key === undefined ? { length: 0, span: 1, gap: 0 } : this.entryOf(key);
  }

  private lengthAt(position: number): number {
    return this.entryAt(position).length;
  }

  /** A position inside the tree's own entries, clamped to the first or the last. */
  private clamp(position: number, tree: readonly number[]): number {
    const last = tree.length - 2;
    return last < 0 ? -1 : Math.max(0, Math.min(position, last));
  }

  /** The sum of the first `count` entries (a Fenwick prefix query). */
  private prefix(tree: readonly number[], count: number): number {
    let sum = 0;
    for (let at = count; at > 0; at -= at & -at) {
      sum += tree[at] ?? 0;
    }
    return sum;
  }

  /** Adds `delta` to the entry at `position` (a Fenwick point update). */
  private add(tree: number[], position: number, delta: number): void {
    if (delta === 0) {
      return;
    }
    for (let at = position + 1; at < tree.length; at += at & -at) {
      tree[at] += delta;
    }
  }
}

/** How far this block's start is from the next block's start. */
function strideOf(entry: BlockEntry): number {
  return entry.length + entry.gap;
}
