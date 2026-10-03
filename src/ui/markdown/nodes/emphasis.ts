/**
 * Renders an `emphasis` node. While the caret is inside it, the block shows the
 * author's own `*…*` (or `_…_`) instead, so the markers are characters the caret
 * can sit between and edit.
 *
 * May import: the revealable contract (`revealable_node.ts`), the node contract
 * (`editable_node.ts`), the registry's child helper and the AST types. Upholds:
 * the source view is built from the node's own markdown, so the node shows its
 * source while the caret is inside it and renders itself otherwise.
 */

import { appendChildren } from '../registry';
import { tagRawRange } from './editable_node';
import type { AstEmphasis } from '../ast';
import { RevealableNodeComponent, sourceViewFor, wrappedContent } from './revealable_node';

const SOURCE_CLASS = 'markdown-emphasis-source';

export class Emphasis extends RevealableNodeComponent {
  constructor(node: AstEmphasis) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, (source) => wrappedContent(node, source));
    super('emphasis', node, sourceView ?? document.createElement('em'));
    if (sourceView) {
      return;
    }
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }

  /** The children between the delimiters. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return wrappedContent(this.node, source);
  }
}
