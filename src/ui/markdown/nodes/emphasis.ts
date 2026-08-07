import { appendChildren } from '../create_node';
import { EditableNodeComponent } from './editable_node';
import type { AstEmphasis } from '../ast';

/** Renders an `emphasis` node. */
export class Emphasis extends EditableNodeComponent {
  constructor(node: AstEmphasis) {
    super('emphasis', node, document.createElement('em'));
    appendChildren(this.element, node.children);
  }
}
