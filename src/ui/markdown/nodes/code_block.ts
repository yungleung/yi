/**
 * Renders a fenced `code` node with highlight.js syntax highlighting.
 *
 * May import: the node contract (`editable_node.ts`), the highlighter and the
 * AST types. Upholds: a block's rendering is a pure function of its own source —
 * the element is built from the node it was given and knows nothing about where
 * the block sits.
 */

import hljs from 'highlight.js';
import { EditableNodeComponent } from './editable_node';
import type { AstCode } from '../ast';

export class CodeBlock extends EditableNodeComponent {
  constructor(node: AstCode) {
    super('code', node, document.createElement('pre'), 'overflow-x-auto');

    const code = document.createElement('code');
    const text = String(node.value ?? '');
    if (node.lang) {
      code.className = `language-${node.lang}`;
    }

    try {
      code.innerHTML =
        node.lang && hljs.getLanguage(node.lang)
          ? hljs.highlight(text, { language: node.lang, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
    } catch {
      code.textContent = text;
    }

    this.element.appendChild(code);
  }
}
