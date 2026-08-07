import hljs from 'highlight.js';
import { EditableNodeComponent } from './editable_node';
import type { AstCode } from '../ast';

/** Renders a fenced `code` node with highlight.js syntax highlighting. */
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
