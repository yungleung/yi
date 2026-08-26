import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstStrong } from '../ast';

/** Renders a `strong` node. */
export class Strong extends EditableNodeComponent {
  constructor(node: AstStrong) {
    super('strong', node, document.createElement('strong'));
    appendChildren(this.element, node.children);
  }
}
