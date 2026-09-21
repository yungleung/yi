/**
 * Renders an `emphasis` node.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the tags it writes name the raw range the node occupies.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstEmphasis } from '../ast';

export class Emphasis extends EditableNodeComponent {
  constructor(node: AstEmphasis) {
    super('emphasis', node, document.createElement('em'));
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }
}
