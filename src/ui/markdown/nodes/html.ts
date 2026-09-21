/**
 * Renders an `html` node as escaped text inside a `<pre>`, so raw HTML is shown
 * rather than executed.
 *
 * May import: the node contract (`editable_node.ts`) and the AST types. Upholds:
 * a block's rendering is a pure function of its own source.
 */

import { EditableNodeComponent } from './editable_node';
import type { AstHtml } from '../ast';

export class HtmlBlock extends EditableNodeComponent {
  constructor(node: AstHtml) {
    super('html', node, document.createElement('pre'));
    this.element.textContent = String(node.value ?? '');
  }
}
