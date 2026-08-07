import { EditableNodeComponent } from './editable_node';
import type { AstHtml } from '../ast';

/** Renders an `html` node as escaped text inside a `<pre>`. */
export class HtmlBlock extends EditableNodeComponent {
  constructor(node: AstHtml) {
    super('html', node, document.createElement('pre'));
    this.element.textContent = String(node.value ?? '');
  }
}
