/**
 * The editor state: owns the raw markdown document and maintains the blocks
 * derived from it.
 *
 * The raw document is the single source of truth; blocks are views over
 * slices of its lines. The editor reads the blocks to render them (one
 * {@link BlockComponent} per block) and will apply edits against the raw
 * text through this state, re-splitting only the affected region.
 *
 * The text itself is a piece table (`text_store.ts`), so an edit costs the piece
 * it touches rather than a copy of the document; everyone above this file still
 * asks for the text and gets a string.
 *
 * May import: the block model (`blocks.ts`), text store, history, target indexes
 * and the derived block parse cache. Upholds: the raw document is the only source
 * of truth — blocks, parses and undo history derive from it, and an edit re-splits
 * only what it touched.
 */

import { splitBlocks, splitBlocksFrom, type MarkdownBlock } from './block';
import type { RootContent } from 'mdast';
import { History, type DocumentEdit, type EditKind, type EditMark } from './history';
import type { HeadingTarget } from './heading_index';
import { referenceIndex, type ReferenceEntry } from './reference_index';
import { TextStore } from './text_store';
import { BlockParseCache } from './block';
import { readFrontmatterBlock } from './identity';
import {
  theoremVocabularyFromFrontmatter,
  type TheoremVocabulary
} from '../syntax/theorem';

let nextDocumentNumber = 0;

/** Mints the identity an agent can use to tell one loaded document from another. */
function newDocumentKey(): string {
  nextDocumentNumber += 1;
  return `document-${nextDocumentNumber.toString(36)}`;
}

/**
 * Where an edit leaves the caret, as its caller can state it: an offset, or a rule
 * that reads the *new* text for one. A rule is what `Enter` at the end of a block
 * needs — the empty paragraph it adds is a line only the edited document can point
 * at (`firstEmptyParagraphAfter`), and an offset read against the old text names the
 * block the key was pressed in rather than the line it made.
 */
export type EditCaret = number | ((state: MarkdownEditorState) => number);

export class MarkdownEditorState {
  /** Stable while this text is open; replaced when another document loads. */
  private documentKeyValue = newDocumentKey();
  /** Committed text changes in this document, including undo and redo. */
  private revisionValue = 0;
  /** The document's text, as the pieces every edit is applied to. */
  private readonly text: TextStore;
  /**
   * The text as a string, materialised once per text version. Many callers read
   * the whole document per command (find, formatting, the clipboard), and each
   * of them walking the pieces would be the store's cost without its point.
   */
  private cachedText: string | null = null;
  private blocks: MarkdownBlock[];
  /** Derived block parses and the label/reference versions that key them. */
  private readonly parses = new BlockParseCache(() => this.theoremVocabulary());
  /** The edits applied to the loaded text, and where in them the document is. */
  private readonly history = new History();
  /** Shared targets for the current text, computed only when navigation asks. */
  private cachedReferences: readonly ReferenceEntry[] | null = null;
  /** Heading projection of the shared target index. */
  private cachedHeadings: readonly HeadingTarget[] | null = null;
  /** The theorem declarations resolved from the current frontmatter. */
  private cachedTheoremVocabulary: TheoremVocabulary | null = null;

  constructor(text = '') {
    this.text = new TextStore(text);
    this.blocks = splitBlocks(text);
  }

  /** The raw markdown document. */
  getText(): string {
    this.cachedText ??= this.text.toString();
    return this.cachedText;
  }

  /** The current document's identity, retained across its edits. */
  getDocumentKey(): string {
    return this.documentKeyValue;
  }

  /**
   * The committed change number for the current document.
   *
   * Example: after loading a note the value is 0; one edit, undo and redo leave
   * it at 3, while loading another note starts again at 0 with a new key.
   */
  getRevision(): number {
    return this.revisionValue;
  }

  /** The document's blocks, in document order. */
  getBlocks(): readonly MarkdownBlock[] {
    return this.blocks;
  }

  /** The theorem vocabulary declared by the current document. */
  theoremVocabulary(): TheoremVocabulary {
    this.cachedTheoremVocabulary ??=
      theoremVocabularyFromFrontmatter(readFrontmatterBlock(this.getText()));
    return this.cachedTheoremVocabulary;
  }

  /** Every reference target and numbered object in the current document. */
  referenceEntries(): readonly ReferenceEntry[] {
    this.cachedReferences ??= referenceIndex(this.getText());
    return this.cachedReferences;
  }

  /** Every heading target in the current document, resolved lazily and cached. */
  headingTargets(): readonly HeadingTarget[] {
    this.cachedHeadings ??= this.referenceEntries()
      .filter((entry) => entry.kind === 'heading')
      .map((entry) => ({
        id: entry.id!,
        from: entry.from,
        to: entry.to,
        title: entry.title,
        explicit: entry.explicit
      }));
    return this.cachedHeadings;
  }

  /**
   * The key a block's parse is held under — and, because a rendering is built from
   * that parse, the key a block is re-rendered by (`virtual_block_renderer`).
   *
   * A block's own text is not the whole input to its parse. Markdown reads `[^x]`
   * as a footnote reference only when the definition is in the same parse, so a
   * block holding a marker is parsed with the document's definitions *borrowed*
   * (`withFootnoteDefinitions`): renaming or removing a definition elsewhere
   * rewrites how this block's brackets read. The labels' version is therefore part
   * of its key, and the version moves only when the *set* of labels really changed —
   * not on every keystroke in a note that sits on a definition line, which is what
   * folding the labels after each edit otherwise lets through.
   *
   * A block with no marker in it cannot be affected by any of that, and keeps the
   * key it had: the label version may not throw away the parses — or the heights
   * remembered against these keys — of blocks the change cannot reach.
   */
  parseKey(block: MarkdownBlock): string {
    return this.parses.key(block);
  }

  /**
   * The block's mdast nodes, parsed from its own raw slice with
   * block-relative positions, and cached per block.
   */
  getBlockContent(block: MarkdownBlock): RootContent[] {
    return this.parses.get(block, this.getText());
  }

  /**
   * Replaces the document: re-splits the blocks (cheap, line-based) and
   * retains cached parses for unchanged blocks.
   */
  setText(text: string, marks?: { before: EditMark; after?: EditMark }): void {
    const before = this.getText();
    if (text === before) {
      return;
    }
    const edit: DocumentEdit = { from: 0, to: before.length, removed: before, inserted: text };
    if (marks) {
      edit.before = marks.before;
      if (marks.after) {
        edit.after = marks.after;
      }
    }
    this.updateText(edit, () => this.text.replace(0, this.text.length, text));
    // A command that computes a whole document is recorded as one whole-document
    // edit: still one undo step, and still exact, for the two commands that do this
    // (inline formatting, find and replace all). What it remembers of its author comes
    // in with the call: those two know different things about where they were (see
    // `formatting.ts` and `find/controller.ts`).
    this.history.record(edit);
  }

  /**
   * Applies one change to the text, then re-derives everything computed from it.
   * The change is expressed as the edit itself rather than as the text it
   * produces, which is what lets the store take it piece by piece and the blocks
   * keep the halves the edit did not reach.
   */
  private updateText(edit: DocumentEdit, apply: () => void): void {
    const previous = this.blocks;
    apply();
    this.revisionValue += 1;
    this.cachedText = null;
    this.cachedHeadings = null;
    this.cachedReferences = null;
    this.cachedTheoremVocabulary = null;
    this.blocks = splitBlocksFrom(this.getText(), previous, edit);
    this.parses.afterEdit(this.getText(), edit);
  }

  /**
   * Replaces a raw document range with `replacement`, and hands back where the caret
   * lands: the `caret` option, resolved against the text just written — the end of the
   * replacement when the caller names none.
   */
  replaceRange(
    from: number,
    to: number,
    replacement: string,
    options: { before?: EditMark; caret?: EditCaret; kind?: EditKind } = {}
  ): number {
    const length = this.text.length;
    const start = Math.max(0, Math.min(from, length));
    const end = Math.max(start, Math.min(to, length));
    const removed = this.text.slice(start, end);
    const edit: DocumentEdit = { from: start, to: end, removed, inserted: replacement };
    if (options.before) {
      edit.before = options.before;
    }
    this.updateText(edit, () => this.text.replace(start, end, replacement));
    // The caret is read with the new text in place: a rule — the empty paragraph
    // `Enter` has just made — can only answer now. The history keeps it as the mark
    // this edit comes back to (`history.ts: invert`), and the caller gets the same
    // offset back to place the caret.
    const caret =
      options.caret === undefined
        ? start + replacement.length
        : typeof options.caret === 'function'
          ? options.caret(this)
          : options.caret;
    if (options.caret !== undefined) {
      edit.after = { from: caret, to: caret };
    }
    this.history.record(edit, options.kind);
    return caret;
  }

  /**
   * Loads a new document without parsing it eagerly. Blocks are parsed as they
   * enter the virtualized viewport. A new document is not a continuation of the
   * old one, so the pieces the old one's edits replaced are dropped with it.
   */
  loadText(text: string): void {
    const replace = { from: 0, to: this.text.length, removed: '', inserted: text };
    this.updateText(replace, () => {
      this.text.replace(0, this.text.length, text);
      this.text.compact();
    });
    this.documentKeyValue = newDocumentKey();
    this.revisionValue = 0;
    this.parses.clear();
    this.history.clear();
  }

  /** Steps back one edit, and hands back the edit it applied, or null. */
  undo(): DocumentEdit | null {
    const edit = this.history.undo();
    if (!edit) {
      return null;
    }
    // History edits are applied through `updateText` rather than `replaceRange`,
    // so undoing cannot record itself as a new edit.
    this.updateText(edit, () => this.text.replace(edit.from, edit.to, edit.inserted));
    return edit;
  }

  /** Re-applies the last undone edit, and hands back the edit, or null. */
  redo(): DocumentEdit | null {
    const edit = this.history.redo();
    if (!edit) {
      return null;
    }
    this.updateText(edit, () => this.text.replace(edit.from, edit.to, edit.inserted));
    return edit;
  }

  /** The edits in force, oldest first — the history, for tests and tooling. */
  historyEdits(): readonly DocumentEdit[] {
    return this.history.edits();
  }

  /**
   * Whether the current blocks' raw slices re-assemble into the document
   * text (blocks are separated by blank lines, which belong to no block).
   * This checks that block offsets stayed in sync with the raw document.
   */
  validateBlocks(): boolean {
    const text = this.getText();
    let rebuilt = '';
    let prevEnd = 0;
    for (const block of this.blocks) {
      if (block.charStart > prevEnd) {
        rebuilt += text.slice(prevEnd, block.charStart);
      }
      rebuilt += block.text;
      prevEnd = block.charEnd;
    }
    rebuilt += text.slice(prevEnd);
    return rebuilt === text;
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
