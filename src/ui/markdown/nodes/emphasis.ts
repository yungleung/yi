import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownEmphasis } from './editable_node';

/** Renders an `emphasis` node. */
export class Emphasis extends EditableNodeComponent {
  constructor(node: MarkdownEmphasis) {
    super('emphasis', node, document.createElement('em'));
    appendChildren(this.element, node.children);
  }
}
