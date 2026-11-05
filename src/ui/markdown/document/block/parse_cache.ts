/**
 * Caches each block's mdast parse and the borrowed footnote label set that can
 * change it.
 *
 * Example: typing inside a paragraph reuses its parsed nodes; renaming a
 * footnote definition elsewhere gives only blocks that contain a reference a
 * new parse key.
 *
 * May import: block model/input, footnotes, parser and pure syntax facts.
 * Upholds: parses are keyed by content and dependency versions, not line
 * numbers, and the cache remains bounded.
 */

import type { RootContent } from 'mdast';
import {
  blockContentKey,
  blockParseInput,
  type MarkdownBlock
} from './model';
import { isRawRendered } from './kinds';
import type { DocumentEdit } from '../history';
import {
  containsReference,
  footnoteLabels,
  isOwnNode,
  labelsAfterEdit,
  sameLabels,
  withFootnoteDefinitions
} from '../../syntax/footnote';
import { parseMarkdown } from '../../syntax/parser';
import { listingFenceData } from '../../syntax/code';
import {
  DEFAULT_THEOREM_VOCABULARY,
  type TheoremVocabulary
} from '../../syntax/theorem';

/** Parsed blocks kept before the oldest is dropped. */
const PARSED_BLOCK_LIMIT = 400;

export class BlockParseCache {
  private readonly content = new Map<string, RootContent[]>();
  private labels: ReadonlySet<string> | null = null;
  private labelsVersion = 0;
  private referencesVersion = 0;

  constructor(
    private readonly theoremVocabulary: () => TheoremVocabulary =
      () => DEFAULT_THEOREM_VOCABULARY
  ) {}

  /**
   * The key a block's parse is held under. Footnote labels and reference targets
   * affect only blocks whose Markdown actually depends on them.
   */
  key(block: MarkdownBlock): string {
    const contentKey = blockContentKey(block);
    const labeled = containsReference(block.text)
      ? `${contentKey}:labels@${this.labelsVersion}`
      : contentKey;
    const referenceSensitive =
      block.text.includes('[#') ||
      /(?:^|\n)[ \t]*!\[/.test(block.text) ||
      /(?:^|\n):\s+/.test(block.text) ||
      (block.kind === 'fencedCode' && listingFenceData(block.text) !== null);
    const referenceKey = referenceSensitive
      ? `${labeled}:references@${this.referencesVersion}`
      : labeled;
    return block.text.includes(':::')
      ? `${referenceKey}:theorems@${this.theoremVocabulary().key}`
      : referenceKey;
  }

  /** The block's parsed mdast nodes, borrowing the document's footnotes. */
  get(block: MarkdownBlock, text: string): RootContent[] {
    if (block.kind === 'blank') {
      return [];
    }
    const key = this.key(block);
    const cached = this.content.get(key);
    if (cached) {
      return cached;
    }
    const prepared = blockParseInput(block);
    const withContext = isRawRendered(block.kind)
      ? prepared
      : withFootnoteDefinitions(prepared, this.footnoteLabels(text));
    const parsed = parseMarkdown(withContext, {
      theoremVocabulary: this.theoremVocabulary()
    })
      .children.filter((child) => isOwnNode(child, prepared.length));
    this.content.set(key, parsed);
    if (this.content.size > PARSED_BLOCK_LIMIT) {
      const oldest = this.content.keys().next().value as string | undefined;
      if (oldest !== undefined && oldest !== key) {
        this.content.delete(oldest);
      }
    }
    return parsed;
  }

  /**
   * Advances dependency versions after an edit. Reading every definition on
   * every keystroke is avoided by updating the known label set incrementally.
   */
  afterEdit(text: string, edit: DocumentEdit): void {
    this.referencesVersion += 1;
    if (!this.labels) {
      return;
    }
    const next = labelsAfterEdit(this.labels, text, edit);
    if (!sameLabels(this.labels, next)) {
      this.labels = next;
      this.labelsVersion += 1;
    }
  }

  /** Drops content-keyed parses when a different document loads. */
  clear(): void {
    this.content.clear();
  }

  private footnoteLabels(text: string): ReadonlySet<string> {
    this.labels ??= footnoteLabels(text);
    return this.labels;
  }
}
