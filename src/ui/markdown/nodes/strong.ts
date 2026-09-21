/**
 * Renders a `strong` node.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the tags it writes name the raw range the node occupies.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstStrong } from '../ast';

export class Strong extends EditableNodeComponent {
  constructor(node: AstStrong) {
    super('strong', node, document.createElement('strong'));
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }
}
