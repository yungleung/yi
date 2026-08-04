import { EditableNodeComponent, type MarkdownText } from './editable_node';

/** Renders a plain text leaf as an editable component. */
export class TextNode extends EditableNodeComponent {
  constructor(node: MarkdownText) {
    super('text', node, document.createElement('span'));
    this.element.textContent = String(node.value ?? '');
  }
}
