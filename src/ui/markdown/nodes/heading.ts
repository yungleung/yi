import { appendChildren } from '../create_node';
import { EditableNodeComponent } from './editable_node';
import type { AstHeading } from '../ast';

/** Renders a `heading` node as h1..h6 based on its depth. */
export class Heading extends EditableNodeComponent {
  constructor(node: AstHeading) {
    const depth = Math.min(Math.max(node.depth ?? 1, 1), 6);
    super('heading', node, document.createElement('h' + depth), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
