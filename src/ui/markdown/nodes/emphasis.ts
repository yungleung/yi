import { appendChildren } from '../registry';
import { EditableNodeComponent, tagRawRange } from './editable_node';
import type { AstEmphasis } from '../ast';

/** Renders an `emphasis` node. */
export class Emphasis extends EditableNodeComponent {
  constructor(node: AstEmphasis) {
    super('emphasis', node, document.createElement('em'));
    tagRawRange(this.element, node);
    appendChildren(this.element, node.children);
  }
}
