import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownBlockquote } from './editable_node';

/** Renders a `blockquote` node. */
export class Blockquote extends EditableNodeComponent {
  constructor(node: MarkdownBlockquote) {
    super('blockquote', node, document.createElement('blockquote'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
