/**
 * A fenced block's body: the characters between its delimiter lines, highlighted, editable where
 * they sit.
 *
 * The delimiters are never drawn — the body is what the block shows — and the caret maps through
 * the body's own characters, so the element is tagged with the body's block-relative start. That
 * is frontmatter's shape with the fence lines cut off (`syntax/markers.ts: fenceBody`), and it is
 * what gives a blank line inside the body a line of its own to hold the caret: a rendering built
 * from the parsed node has none, so Enter at the end of the body left the caret behind (measured:
 * a space-width to the right of the old line's end).
 *
 * May import: the node contract (`editable_node.ts`), the marker rule (`syntax/markers.ts`) and the
 * block model's types. Upholds: the text is the document's own characters from the tagged offset,
 * one for one — a keystroke inside maps back to the document exactly — and the highlighting never
 * changes a character of it.
 */

import { EditableNodeComponent } from './editable_node';
import { fenceBody } from '../syntax/markers';
import type { AstNode } from '../ast';
import type { BlockNode } from '../document/blocks';

/** How one kind of fenced block draws its body: the class on the box, its language, its markup. */
export interface FenceBodyStyle {
  /** The class that marks the block's kind — where its box and its margin come from. */
  readonly className: string;
  /** The language the markup is in, as a `language-…` class, or the empty string for none. */
  readonly language: string;
  /** The body's markup: the highlighter's answer, which must not change a character of it. */
  readonly highlight: (source: string) => string;
}

export class FenceBody extends EditableNodeComponent {
  constructor(node: BlockNode, style: FenceBodyStyle) {
    // The block tree's nodes are mdast-like (see `blocks.ts`), and this component renders one of
    // them rather than a node of the parsed tree.
    super('fenceBody', node as unknown as AstNode, document.createElement('pre'), style.className);
    const { start, end } = fenceBody(node.text);
    this.element.dataset.textFrom = String(start);
    const code = document.createElement('code');
    if (style.language !== '') {
      code.className = `language-${style.language}`;
    }
    code.innerHTML = style.highlight(node.text.slice(start, end));
    this.element.appendChild(code);
  }
}
