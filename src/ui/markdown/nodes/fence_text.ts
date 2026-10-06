/**
 * A fenced block's text: the characters the caret edits, delimiters or not.
 *
 * A fenced block shows one of two things (see `source_mode.ts`): its **body**, with the delimiters
 * hidden, which is what it renders while the caret is elsewhere; or its own **text**, delimiters and
 * all, which is what it shows — and what the caret maps through — while the caret is inside it. Both
 * are the document's own characters, one for one, and the element is tagged with the block-relative
 * start of what it holds, so a click lands on the character clicked and a keystroke maps back
 * exactly.
 *
 * The body is highlighted in the block's language; the delimiter lines are drawn as the markup they
 * are, in the source's comment colour (`styles.css`), which tells them apart from the body without
 * changing a character of them. The body's range is the one `syntax/markers.ts: fenceBody` names,
 * and it is what gives a blank line inside the body a line of its own to hold the caret: a rendering
 * built from the parsed node has none, so Enter at the end of the body left the caret behind
 * (measured: a space-width to the right of the old line's end).
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
import { TEXT_FROM, setOffset } from './../offset_tags';

/** How one kind of fenced block draws its text: the class on the box, its language, its markup. */
export interface FenceTextStyle {
  /** The class that marks the block's kind — where its box and its margin come from. */
  readonly className: string;
  /** The language the markup is in, as a `language-…` class, or the empty string for none. */
  readonly language: string;
  /** The body's markup: the highlighter's answer, which must not change a character of it. */
  readonly highlight: (source: string) => string;
}

export class FenceText extends EditableNodeComponent {
  /**
   * `delimiters` is whether the block's own lines are drawn around the body: false for what the
   * block renders while the caret is elsewhere, true for the source view the caret edits.
   */
  constructor(node: BlockNode, style: FenceTextStyle, delimiters = false) {
    // The block tree's nodes are mdast-like (see `blocks.ts`), and this component renders one of
    // them rather than a node of the parsed tree.
    super('fenceText', node as unknown as AstNode, document.createElement('pre'), style.className);
    const { start, end } = fenceBody(node.text);
    const body = markup(node.text.slice(start, end), style);
    if (!delimiters) {
      setOffset(this.element, TEXT_FROM, start);
      this.element.appendChild(body);
      return;
    }
    // The block's own text, delimiters and all: the three pieces are contiguous and in order, so
    // the element holds the document's characters from zero on.
    setOffset(this.element, TEXT_FROM, 0);
    const opening = delimiterLine(node.text.slice(0, start));
    const closing = delimiterLine(node.text.slice(end));
    if (opening) {
      this.element.appendChild(opening);
    }
    this.element.appendChild(body);
    if (closing) {
      this.element.appendChild(closing);
    }
  }
}

/** A run of the block's characters as markup: a `code` element holding the highlighter's answer. */
function markup(source: string, style: FenceTextStyle): HTMLElement {
  const code = document.createElement('code');
  if (style.language !== '') {
    code.className = `language-${style.language}`;
  }
  code.innerHTML = style.highlight(source);
  // A body with nothing in it is still a place: the caret has to have a text node to sit in, or
  // clicking the rendering cannot enter the block at all and the next keystroke goes wherever the
  // caret already was (measured: an empty formula's fences were replaced by the typed letter).
  if (code.firstChild === null) {
    code.appendChild(document.createTextNode(''));
  }
  return code;
}

/** One of the block's own delimiter lines, dimmed as the markup it is, or null when there is none. */
function delimiterLine(source: string): HTMLElement | null {
  if (source === '') {
    return null;
  }
  const span = document.createElement('span');
  span.className = 'markdown-fence-delimiter';
  span.textContent = source;
  return span;
}
