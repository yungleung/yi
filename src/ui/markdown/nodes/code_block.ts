/**
 * Renders a `code` node with highlight.js syntax highlighting.
 *
 * A `code` node is what an *indented* block holds: a fenced block renders its own text instead
 * (`create_block.ts`, `nodes/fence_text.ts`), because a fence is text the caret maps through rather
 * than a node whose length approximates it.
 *
 * May import: the node contract (`editable_node.ts`), the code highlighter and the AST types.
 * Upholds: a block's rendering is a pure function of its own source — the element is built from the
 * node it was given and knows nothing about where the block sits.
 */

import { EditableNodeComponent } from './editable_node';
import { highlightCode } from './code_highlight';
import type { AstCode } from '../ast';

export class CodeBlock extends EditableNodeComponent {
  constructor(node: AstCode) {
    super('code', node, document.createElement('pre'), 'overflow-x-auto');

    const code = document.createElement('code');
    const language = String(node.lang ?? '');
    if (language !== '') {
      code.className = `language-${language}`;
    }
    code.innerHTML = highlightCode(String(node.value ?? ''), language);
    this.element.appendChild(code);
  }
}
