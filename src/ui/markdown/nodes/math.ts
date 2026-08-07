import katex from 'katex';
import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import { EditableNodeComponent } from './editable_node';

function renderKatex(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    output: 'html'
  });
}

/** Renders an `inlineMath` node with KaTeX. */
export class InlineMath extends EditableNodeComponent {
  constructor(node: InlineMathNode) {
    super('inlineMath', node, document.createElement('span'), 'mx-1 align-middle');
    try {
      this.element.innerHTML = renderKatex(node.value, false);
    } catch {
      this.element.textContent = node.value;
    }
  }
}

/** Renders a display `math` node with KaTeX. */
export class DisplayMath extends EditableNodeComponent {
  constructor(node: MathNode) {
    super('math', node, document.createElement('div'), 'my-4 overflow-x-auto');
    try {
      this.element.innerHTML = renderKatex(node.value, true);
    } catch {
      this.element.textContent = node.value;
    }
  }
}
