/**
 * Renders an `inlineCode` node. While the caret is inside it, the block shows
 * the author's own backticks around the text, so the delimiters are characters
 * the caret can sit between and edit; when it is rendered, the content's raw
 * start is tagged so a caret inside it maps back to the document exactly.
 *
 * May import: the revealable contract (`revealable_node.ts`), the node contract
 * (`editable_node.ts`) and the AST types. Upholds: the source view is built from
 * the node's own markdown, so the node shows its source while the caret is
 * inside it and renders itself otherwise.
 */

import { tagRawRange } from './editable_node';
import type { AstInlineCode } from '../ast';
import { preserveSpaces } from './text';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-inline-code-source';

/** Renders an `inlineCode` node. */
export class InlineCode extends RevealableNodeComponent {
  constructor(node: AstInlineCode) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, codeContent);
    super(
      'inlineCode',
      node,
      sourceView ?? document.createElement('code'),
      sourceView ? '' : 'markdown-inline-code'
    );
    if (sourceView) {
      return;
    }
    this.element.textContent = preserveSpaces(String(node.value ?? ''));
    tagRawRange(this.element, node);
    // Tag the content's raw start (after the opening backtick) so DOM
    // positions inside the code map back to the document exactly (see
    // `caret/offsets.ts`). Positions are absolute in the current whole-document
    // parse; single-backtick code is the common case.
    const start = (
      node as { position?: { start: { offset?: number } } }
    ).position?.start.offset;
    if (start !== undefined) {
      this.element.dataset.textFrom = String(start + 1);
    }
  }

  /** The text between the opening and closing runs of backticks. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return codeContent(source);
  }
}

/**
 * Where an inline code span's text sits inside its own source: between the
 * backtick runs that open and close it, which markdown requires to be the same
 * length. The span holds no children to read it off, so the characters say it.
 */
function codeContent(source: string): { start: number; end: number } {
  const opening = /^`+/.exec(source)?.[0].length ?? 0;
  const marker = Math.min(opening, Math.floor(source.length / 2));
  return { start: marker, end: source.length - marker };
}
