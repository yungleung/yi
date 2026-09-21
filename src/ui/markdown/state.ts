/**
 * The editor state: owns the raw markdown document and maintains the blocks
 * derived from it.
 *
 * The raw document is the single source of truth; blocks are views over
 * slices of its lines. The editor reads the blocks to render them (one
 * {@link MarkdownBlockView} per block) and will apply edits against the raw
 * text through this state, re-splitting only the affected region.
 *
 * May import: the block model (`blocks.ts`) and the parser (`syntax/parser.ts`
 * with its repairs). Upholds: the raw document is the only source of truth —
 * blocks, parses and the undo history are all derived from it, and an edit
 * re-splits only what it touched.
 */

import { blockContentKey, isRawRendered, splitBlocks, type MarkdownBlock } from './blocks';
import type { RootContent } from 'mdast';
import { footnoteLabels, withFootnoteDefinitions } from './syntax/footnotes';
import { parseMarkdown } from './syntax/parser';
import { blockParseInput } from './blocks';

/**
 * One undo step: the document text before the edit and after it. Whole-text
 * snapshots keep undo trivial and exact for a block-based document, and the
 * renderer only rebuilds the blocks whose source actually changed.
 */
interface HistoryEntry {
  before: string;
  after: string;
}

/** Parsed blocks kept before the oldest is dropped. */
const PARSED_BLOCK_LIMIT = 400;

export class MarkdownEditorState {
  private text: string;
  private blocks: MarkdownBlock[];
  /**
   * Parses per block content (`kind:text`), with block-relative positions.
   * Keyed by content, not by line number: an edit shifts every line below it,
   * and a shifted block's parse is still valid.
   */
  private readonly blockContent = new Map<string, RootContent[]>();
  /** The labels the document defines, recomputed after every edit. */
  private labels: Set<string> | null = null;
  private readonly history: HistoryEntry[] = [];
  private historyIndex = 0;

  constructor(text = '') {
    this.text = text;
    this.blocks = splitBlocks(text);
  }

  /** The raw markdown document. */
  getText(): string {
    return this.text;
  }

  /** The document's blocks, in document order. */
  getBlocks(): readonly MarkdownBlock[] {
    return this.blocks;
  }

  /**
   * The block's mdast nodes, parsed from its own raw slice with
   * block-relative positions, and cached per block.
   */
  getBlockContent(block: MarkdownBlock): RootContent[] {
    if (block.kind === 'blank') {
      return [];
    }
    const key = blockContentKey(block);
    const cached = this.blockContent.get(key);
    if (cached) {
      return cached;
    }
    // Markdown reads `[^1]` as a footnote reference only when its definition is
    // in the same parse, and this parses one block at a time: the definitions
    // the block's references need are borrowed from the rest of the document
    // (see `footnotes.ts`), and the nodes they parse into are dropped again.
    const prepared = blockParseInput(block);
    // A raw block (code, math, html) has no footnote references: its brackets
    // are text, so its parse input is left exactly as it stands.
    const withContext = isRawRendered(block.kind)
      ? prepared
      : withFootnoteDefinitions(prepared, this.footnoteLabels());
    const content = parseMarkdown(withContext)
      .children.filter((child) => isOwnContent(child, prepared.length));
    this.blockContent.set(key, content);
    // Every edit mints one new key, so the cache needs a bound of its own.
    if (this.blockContent.size > PARSED_BLOCK_LIMIT) {
      const oldest = this.blockContent.keys().next().value as string | undefined;
      if (oldest !== undefined && oldest !== key) {
        this.blockContent.delete(oldest);
      }
    }
    return content;
  }

  /**
   * Replaces the document: re-splits the blocks (cheap, line-based) and
   * retains cached parses for unchanged blocks.
   */
  setText(text: string): void {
    if (text === this.text) {
      return;
    }
    const before = this.text;
    this.updateText(text);
    this.recordHistory({ before, after: text });
  }

  private updateText(text: string): void {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.labels = null;
  }

  /** The labels the document defines, read once per text. */
  private footnoteLabels(): ReadonlySet<string> {
    this.labels ??= footnoteLabels(this.text);
    return this.labels;
  }

  /** Replaces a raw document range with `replacement`. */
  replaceRange(from: number, to: number, replacement: string): void {
    const start = Math.max(0, Math.min(from, this.text.length));
    const end = Math.max(start, Math.min(to, this.text.length));
    const before = this.text;
    this.updateText(`${before.slice(0, start)}${replacement}${before.slice(end)}`);
    this.recordHistory({ before, after: this.text });
  }

  /**
   * Loads a new document without parsing it eagerly. Blocks are parsed as they
   * enter the virtualized viewport.
   */
  loadText(text: string): void {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.labels = null;
    this.blockContent.clear();
    this.history.length = 0;
    this.historyIndex = 0;
  }

  /** Steps back one edit. Returns false when there is nothing to undo. */
  undo(): boolean {
    if (this.historyIndex === 0) {
      return false;
    }
    this.updateText(this.history[this.historyIndex - 1].before);
    this.historyIndex -= 1;
    return true;
  }

  /** Re-applies the last undone edit. Returns false when there is none. */
  redo(): boolean {
    if (this.historyIndex >= this.history.length) {
      return false;
    }
    this.updateText(this.history[this.historyIndex].after);
    this.historyIndex += 1;
    return true;
  }

  private recordHistory(entry: HistoryEntry): void {
    this.history.splice(this.historyIndex);
    this.history.push(entry);
    this.historyIndex += 1;
  }

  /**
   * Whether the current blocks' raw slices re-assemble into the document
   * text (blocks are separated by blank lines, which belong to no block).
   * This checks that block offsets stayed in sync with the raw document.
   */
  validateBlocks(): boolean {
    let rebuilt = '';
    let prevEnd = 0;
    for (const block of this.blocks) {
      if (block.charStart > prevEnd) {
        rebuilt += this.text.slice(prevEnd, block.charStart);
      }
      rebuilt += block.text;
      prevEnd = block.charEnd;
    }
    rebuilt += this.text.slice(prevEnd);
    return rebuilt === this.text;
  }

  /** The block containing a 1-based line number, or null (e.g. a blank line). */
  getBlockAtLine(line: number): MarkdownBlock | null {
    let low = 0;
    let high = this.blocks.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const block = this.blocks[middle];
      if (line < block.lineStart) {
        high = middle - 1;
      } else if (line > block.lineEnd) {
        low = middle + 1;
      } else {
        return block;
      }
    }

    return null;
  }

  /** The block containing a character offset, or null (e.g. a separator gap). */
  getBlockAtOffset(offset: number): MarkdownBlock | null {
    let low = 0;
    let high = this.blocks.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const block = this.blocks[middle];
      if (offset < block.charStart) {
        high = middle - 1;
      } else if (offset > block.charEnd) {
        low = middle + 1;
      } else {
        return block;
      }
    }
    return null;
  }

  /**
   * The closest offset to `offset` that lies inside a block. An edit can end
   * the caret on the blank line that separates two blocks, where there is no
   * rendered text to hold it: such a position belongs to the end of the block
   * before it, or to the start of the one after at the very top of the file.
   */
  nearestTextOffset(offset: number): number {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    if (this.getBlockAtOffset(clamped)) {
      return clamped;
    }
    let before: MarkdownBlock | null = null;
    for (const block of this.blocks) {
      if (block.charStart > clamped) {
        break;
      }
      before = block;
    }
    if (before) {
      return before.charEnd;
    }
    return this.blocks.length > 0 ? this.blocks[0].charStart : clamped;
  }

  /**
   * The start offset of the first empty paragraph at or after `offset`, or
   * null when the text has none. Commands use it to move the caret onto the
   * line an edit has just created.
   */
  firstEmptyParagraphAfter(offset: number): number | null {
    for (const block of this.blocks) {
      if (block.kind === 'blank' && block.charStart >= offset) {
        return block.charStart;
      }
    }
    return null;
  }
}

/**
 * Whether a parsed node comes from the block's own text rather than from the
 * footnote definitions borrowed for the parse: the borrowed lines sit after it,
 * so anything starting past its end is not content.
 */
function isOwnContent(node: RootContent, length: number): boolean {
  const start = (node as { position?: { start: { offset?: number } } }).position?.start.offset;
  return start === undefined || start < length;
}
