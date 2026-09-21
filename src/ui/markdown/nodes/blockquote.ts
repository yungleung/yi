/**
 * Renders a `blockquote` node: its children, inside the block's own element.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child
 * helper, and the AST types. Upholds: a block's rendering is a pure function of
 * its own source — the element is built from the node it was given and knows
 * nothing about where the block sits.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstBlockquote } from '../ast';

/** Renders a `blockquote` node. */
export class Blockquote extends EditableNodeComponent {
  constructor(node: AstBlockquote) {
    super('blockquote', node, document.createElement('blockquote'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
