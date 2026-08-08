import { EditableNodeComponent } from './editable_node';
import type { AstInlineCode } from '../ast';

/** Renders an `inlineCode` node. */
export class InlineCode extends EditableNodeComponent {
  constructor(node: AstInlineCode) {
    super('inlineCode', node, document.createElement('code'), 'markdown-inline-code');
    this.element.textContent = String(node.value ?? '');
  }
}
