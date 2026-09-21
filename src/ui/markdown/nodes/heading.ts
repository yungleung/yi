/**
 * Renders a `heading` node as an `h1`–`h6`, by its depth.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the depth comes from the node, not from where it sits.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstHeading } from '../ast';

export class Heading extends EditableNodeComponent {
  constructor(node: AstHeading) {
    const depth = Math.min(Math.max(node.depth ?? 1, 1), 6);
    super('heading', node, document.createElement('h' + depth), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
