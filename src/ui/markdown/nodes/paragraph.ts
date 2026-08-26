import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstParagraph } from '../ast';

/** Renders a `paragraph` node. */
export class Paragraph extends EditableNodeComponent {
  constructor(node: AstParagraph) {
    super('paragraph', node, document.createElement('p'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
