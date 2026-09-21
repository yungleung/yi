/**
 * Renders the `root` of an mdast tree: the prose container a block's children
 * are appended to.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: a block's rendering is a pure function of its own
 * source — the container holds the root's children in order and nothing else.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstRoot } from '../ast';

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
