import { appendChildren } from './create_node';
import { EditableNodeComponent, type MarkdownRoot } from './editable_node';

/** Renders the `root` of an mdast tree (the prose container). */
export class RootNode extends EditableNodeComponent {
  constructor(node: MarkdownRoot) {
    super(
      'root',
      node,
      document.createElement('div'),
      'prose prose-slate leading-6 prose-tight w-full max-w-full'
    );
    appendChildren(this.element, node.children);
  }
}
