/**
 * Renders an `inlineCode` node, and tags the content's raw start so a caret
 * inside it maps back to the document exactly.
 *
 * May import: the node contract (`editable_node.ts`) and the AST types. Upholds:
 * a block's rendering is a pure function of its own source — the tag names the
 * offset the node's own text starts at.
 */

import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstInlineCode } from '../ast';
import { preserveSpaces } from './text';

/** Renders an `inlineCode` node. */
export class InlineCode extends EditableNodeComponent {
  constructor(node: AstInlineCode) {
    super('inlineCode', node, document.createElement('code'), 'markdown-inline-code');
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
}
