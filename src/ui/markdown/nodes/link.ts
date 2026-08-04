import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownLink } from './editable_node';

/** Renders a `link` node. Clicking selects a caret instead of navigating. */
export class Link extends EditableNodeComponent {
  constructor(node: MarkdownLink) {
    super('link', node, document.createElement('a'));
    const anchor = this.element as HTMLAnchorElement;
    anchor.href = node.url || '#';
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    this.element.addEventListener('click', (event) => event.preventDefault());
    appendChildren(this.element, node.children);
  }
}
