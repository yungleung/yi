import { EditableNodeComponent } from './editable_node';
import type { AstText } from '../ast';

/** Renders a plain text leaf as an editable component. */
export class TextNode extends EditableNodeComponent {
  constructor(node: AstText) {
    super('text', node, document.createElement('span'));
    this.element.textContent = String(node.value ?? '');
  }
}
