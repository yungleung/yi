/**
 * The editor state: owns the raw markdown document and maintains the blocks
 * derived from it.
 *
 * The raw document is the single source of truth; blocks are views over
 * slices of its lines. The editor reads the blocks to render them (one
 * {@link MarkdownBlockView} per block) and will apply edits against the raw
 * text through this state, re-splitting only the affected region.
 */

import type { Root } from 'mdast';
import { buildBlockTree, splitBlocks, type BlockRoot, type MarkdownBlock } from './blocks';
import type { RootContent } from 'mdast';
import { parseMarkdown } from './parser';

export class MarkdownEditorState {
  private text: string;
  private blocks: MarkdownBlock[];
  /** The initial whole-document parse, used only for the first render. */
  private parsed: Root;
  /** Whether the document was edited (making the whole-document parse stale). */
  private dirty = false;
  /** Per-block parses (block-relative positions), invalidated on edits. */
  private blockContent: Map<number, RootContent[]> | null = null;

  constructor(text = '') {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.parsed = parseMarkdown(text);
  }

  /** The raw markdown document. */
  getText(): string {
    return this.text;
  }

  /** The document's blocks, in document order. */
  getBlocks(): readonly MarkdownBlock[] {
    return this.blocks;
  }

  /** The mdast-like block tree of the current document. */
  getBlockTree(): BlockRoot {
    return buildBlockTree(this.text);
  }

  /**
   * The initial whole-document mdast tree. Only the first render slices
   * blocks out of it; every later render and edit re-parses only the
   * affected block (see {@link getBlockContent}), so this tree is never
   * updated and must not be used after an edit.
   */
  getParse(): Root {
    return this.parsed;
  }

  /**
   * The block's mdast nodes, parsed from its own raw slice with
   * block-relative positions, and cached per block.
   */
  getBlockContent(block: MarkdownBlock): RootContent[] {
    if (!this.blockContent) {
      this.blockContent = new Map();
    }
    const cached = this.blockContent.get(block.lineStart);
    if (cached) {
      return cached;
    }
    const content = parseMarkdown(block.text).children;
    this.blockContent.set(block.lineStart, content);
    return content;
  }

  /**
   * Replaces the document: re-splits the blocks (cheap, line-based) and
   * invalidates the per-block parse cache. The whole-document tree is not
   * re-parsed — it is only ever used for the initial render.
   */
  setText(text: string): void {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.blockContent = null;
    this.dirty = true;
  }

  /**
   * Loads a new document: re-splits the blocks and re-parses the whole
   * document once, so the initial render can slice blocks out of a single
   * parse instead of parsing every block separately. Edits go through
   * {@link setText}, which never re-parses the whole document.
   */
  loadText(text: string): void {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.parsed = parseMarkdown(text);
    this.blockContent = null;
    this.dirty = false;
  }

  /**
   * Whether the document changed since the whole-document parse (true after
   * an edit). The initial parse is only valid for rendering while clean.
   */
  isDirty(): boolean {
    return this.dirty;
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
    for (const block of this.blocks) {
      if (line >= block.lineStart && line <= block.lineEnd) {
        return block;
      }
    }
    return null;
  }

  /** The block containing a character offset, or null (e.g. a separator gap). */
  getBlockAtOffset(offset: number): MarkdownBlock | null {
    for (const block of this.blocks) {
      if (offset >= block.charStart && offset <= block.charEnd) {
        return block;
      }
    }
    return null;
  }
}
