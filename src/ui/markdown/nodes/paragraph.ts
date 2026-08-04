import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownParagraph } from './editable_node';

/** Renders a `paragraph` node. */
export class Paragraph extends EditableNodeComponent {
  constructor(node: MarkdownParagraph) {
    super('paragraph', node, document.createElement('p'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
