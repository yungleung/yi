/**
 * Renders a `delete` (strikethrough) node.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the tags it writes name the raw range the node occupies.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstDelete } from '../ast';

export class Delete extends EditableNodeComponent {
  constructor(node: AstDelete) {
    super('delete', node, document.createElement('del'));
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }
}
