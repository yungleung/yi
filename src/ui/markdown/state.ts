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
import {
  buildBlockTree,
  sliceBlockTree,
  splitBlocks,
  type BlockRoot,
  type MarkdownBlock
} from './blocks';
import type { RootContent } from 'mdast';
import { parseMarkdown } from './parser';

export class MarkdownEditorState {
  private text: string;
  private blocks: MarkdownBlock[];
  private parsed: Root;
  private slices: Map<number, RootContent[]> | null = null;

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
   * The whole-document mdast tree. Parsed once per document and reused by the
   * renderer, which slices blocks out of it instead of re-parsing every block
   * (re-parsing per block makes large documents markedly slower).
   */
  getParse(): Root {
    return this.parsed;
  }

  /** The block's nodes from the whole-document tree (cached per document). */
  getBlockContent(block: MarkdownBlock): RootContent[] {
    if (!this.slices) {
      this.slices = sliceBlockTree(this.getBlockTree(), this.parsed);
    }
    const index = this.blocks.findIndex(
      (b) => b.charStart === block.charStart && b.lineStart === block.lineStart
    );
    return this.slices.get(index) ?? [];
  }

  /** Replaces the document and re-splits its blocks. */
  setText(text: string): void {
    this.text = text;
    this.blocks = splitBlocks(text);
    this.parsed = parseMarkdown(text);
    this.slices = null;
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
