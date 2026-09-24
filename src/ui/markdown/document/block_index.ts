/**
 * Where the blocks are, kept as arithmetic rather than written on every block.
 *
 * A block starts where the blocks before it end, and its first line is one past the
 * lines they span. Keeping those two sums here is what lets an edit move every block
 * below it without touching any of them: a block holds its own text and its own span,
 * and a Fenwick tree over each carries the rest — a point update and a prefix sum are
 * each O(log blocks), where rewriting the tail was O(blocks) per keystroke.
 *
 * May import: nothing — a block is anything with its own text and its span. Upholds:
 * one fact about where a block sits has one home, this one, and it is read from the
 * block's own text, so nothing here can disagree with what a block holds.
 */

/** What the index needs of a block: its own source, and the lines it spans. */
export interface BlockSource {
  readonly text: string;
  readonly span: number;
}

export class BlockIndex {
  private keys: BlockSource[] = [];
  /** Fenwick trees, 1-based: the lengths of the blocks, and their line spans. */
  private lengths: number[] = [];
  private spans: number[] = [];
  private readonly positions = new WeakMap<BlockSource, number>();

  constructor(blocks: readonly BlockSource[] = []) {
    this.rebuild(blocks);
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
  place(position: number, block: BlockSource): void {
    if (this.keys.length === 0 || position < 0 || position >= this.keys.length) {
      return;
    }
    const replaced = this.keys[position];
    if (replaced !== block) {
      this.positions.delete(replaced);
    }
    this.keys[position] = block;
    this.positions.set(block, position);
    this.add(this.lengths, position, block.text.length - this.lengthAt(position));
    this.add(this.spans, position, block.span - this.spanAt(position));
  }

  /** Recomputes every sum and every position from these blocks, in this order. */
  rebuild(blocks: readonly BlockSource[]): void {
    this.keys = [...blocks];
    this.lengths = new Array(blocks.length + 1).fill(0);
    this.spans = new Array(blocks.length + 1).fill(0);
    for (let at = 0; at < blocks.length; at += 1) {
      this.positions.set(blocks[at], at);
      this.add(this.lengths, at, blocks[at].text.length);
      this.add(this.spans, at, blocks[at].span);
    }
  }

  /** The document offset the block at `position` starts at. */
  startAt(position: number): number {
    return this.prefix(this.lengths, this.clamp(position, this.lengths));
  }

  /** The document offset just past the block at `position`. */
  endAt(position: number): number {
    return this.startAt(position) + this.lengthAt(position);
  }

  /** The 1-based line the block at `position` starts on. */
  lineAt(position: number): number {
    return 1 + this.prefix(this.spans, this.clamp(position, this.spans));
  }

  /** The same three, asked about a block. */
  startOf(block: BlockSource): number {
    return this.startAt(this.positionOf(block));
  }

  endOf(block: BlockSource): number {
    return this.startAt(this.positionOf(block)) + block.text.length;
  }

  lineOf(block: BlockSource): number {
    return this.lineAt(this.positionOf(block));
  }

  /** Where a block sits, or an error: a block this index does not hold has no place. */
  private positionOf(block: BlockSource): number {
    const at = this.positions.get(block);
    if (at === undefined) {
      throw new Error('this block is not in the index');
    }
    return at;
  }

  private lengthAt(position: number): number {
    const at = this.clamp(position, this.lengths);
    return at < 0 ? 0 : this.prefix(this.lengths, at + 1) - this.prefix(this.lengths, at);
  }

  private spanAt(position: number): number {
    const at = this.clamp(position, this.spans);
    return at < 0 ? 0 : this.prefix(this.spans, at + 1) - this.prefix(this.spans, at);
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
