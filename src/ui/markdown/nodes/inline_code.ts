import { EditableNodeComponent, type MarkdownInlineCode } from './editable_node';

/** Renders an `inlineCode` node. */
export class InlineCode extends EditableNodeComponent {
  constructor(node: MarkdownInlineCode) {
    super('inlineCode', node, document.createElement('code'));
    this.element.textContent = String(node.value ?? '');
  }
}
