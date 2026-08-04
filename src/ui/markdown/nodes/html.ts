import { EditableNodeComponent, type MarkdownHtml } from './editable_node';

/** Renders an `html` node as escaped text inside a `<pre>`. */
export class HtmlBlock extends EditableNodeComponent {
  constructor(node: MarkdownHtml) {
    super('html', node, document.createElement('pre'));
    this.element.textContent = String(node.value ?? '');
  }
}
