/**
 * The editor state: owns the raw markdown document and maintains the blocks
 * derived from it.
 *
 * The raw document is the single source of truth; blocks are views over
 * slices of its lines. The editor reads the blocks to render them (one
 * {@link MarkdownBlockView} per block) and will apply edits against the raw
 * text through this state, re-splitting only the affected region.
 */

import { splitBlocks, type MarkdownBlock } from './blocks';
import type { RootContent } from 'mdast';
import { parseMarkdown } from './parser';
import { blockParseInput } from './trailing_spaces';

/**
 * One undo step: the document text before the edit and after it. Whole-text
 * snapshots keep undo trivial and exact for a block-based document, and the
 * renderer only rebuilds the blocks whose source actually changed.
 */
interface HistoryEntry {
  before: string;
  after: string;
}

export class MarkdownEditorState {
  private text: string;
  private blocks: MarkdownBlock[];
  /** Per-block parses (block-relative positions), retained for unchanged blocks. */
  private blockContent: Map<number, RootContent[]> | null = null;
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
    if (!this.blockContent) {
      this.blockContent = new Map();
    }
    const cached = this.blockContent.get(block.lineStart);
    if (cached) {
      return cached;
    }
    const content = parseMarkdown(blockParseInput(block)).children;
    this.blockContent.set(block.lineStart, content);
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
    const previousBlocks = this.blocks;
    const previousContent = this.blockContent;
    this.text = text;
    this.blocks = splitBlocks(text);
    if (previousContent) {
      const unchanged = new Map<number, RootContent[]>();
      const previousByKey = new Map<string, number>();
      for (const block of previousBlocks) {
        previousByKey.set(`${block.lineStart}:${block.lineEnd}:${block.text}`, block.lineStart);
      }
      for (const block of this.blocks) {
        const previousLine = previousByKey.get(`${block.lineStart}:${block.lineEnd}:${block.text}`);
        const content = previousLine === undefined ? undefined : previousContent.get(previousLine);
        if (content) {
          unchanged.set(block.lineStart, content);
        }
      }
      this.blockContent = unchanged;
    } else {
      this.blockContent = null;
    }
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
    this.blockContent = null;
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
