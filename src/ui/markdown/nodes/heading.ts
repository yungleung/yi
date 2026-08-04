import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownHeading } from './editable_node';

/** Renders a `heading` node as h1..h6 based on its depth. */
export class Heading extends EditableNodeComponent {
  constructor(node: MarkdownHeading) {
    const depth = Math.min(Math.max(node.depth ?? 1, 1), 6);
    super('heading', node, document.createElement('h' + depth), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}
