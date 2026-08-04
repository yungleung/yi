import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownStrong } from './editable_node';

/** Renders a `strong` node. */
export class Strong extends EditableNodeComponent {
  constructor(node: MarkdownStrong) {
    super('strong', node, document.createElement('strong'));
    appendChildren(this.element, node.children);
  }
}
