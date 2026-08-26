import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstRoot } from '../ast';

/** Renders the `root` of an mdast tree (the prose container). */
export class RootNode extends EditableNodeComponent {
  constructor(node: AstRoot) {
    super(
      'root',
      node,
      document.createElement('div'),
      'prose prose-slate leading-6 prose-tight w-full max-w-full'
    );
    appendChildren(this.element, node.children);
  }
}
