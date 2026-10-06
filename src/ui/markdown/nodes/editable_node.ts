/**
 * The marker contract every rendered node component implements: it is bound to
 * an mdast node, exposes its element, and places the caret where it was clicked.
 *
 * May import: the AST types and the caret's own placement (`caret/caret.ts`).
 * Upholds: the caret is a document offset — a click inside a node resolves to a
 * rendered position here, and `caret/offsets.ts` reads that back into the
 * document.
 */

import type { AstNode } from '../ast';
import { caretRangeAtPoint, showCaret, showCaretBeside } from '../caret/caret';
import { caretLeft } from '../caret/geometry';
import { FORMAT_FROM, FORMAT_TO, setOffset } from './../offset_tags';

export interface EditableMarkdownNode {
  /** The mdast node type this component renders (also acts as a capability marker). */
  readonly type: string;
  /** The mdast node this component is bound to. */
  readonly node: AstNode;
  /** The rendered DOM element of this node. */
  readonly element: HTMLElement;
  /** Places the blinking caret right after the character under the given viewport point. */
  placeCaretAt(clientX: number, clientY: number): void;
}

/**
 * Tags an element with its node's raw range, so the formatting step can
 * detect the whole formatted unit a selection covers (see
 * `format_dom.ts`). Positions come from the whole-document parse today,
 * so they are absolute; once blocks are parsed independently this becomes
 * block-relative and the mapping must add the block's `charStart`.
 */
export function tagRawRange(
  element: HTMLElement,
  node: { position?: { start: { offset?: number }; end: { offset?: number } } }
): void {
  const position = node.position;
  if (position?.start.offset !== undefined && position.end.offset !== undefined) {
    setOffset(element, FORMAT_FROM, position.start.offset);
    setOffset(element, FORMAT_TO, position.end.offset);
  }
}

/**
 * Base class implementing the {@link EditableMarkdownNode} contract: every
 * node component listens for clicks and places the shared blinking caret right
 * after the clicked character.
 */
export abstract class EditableNodeComponent implements EditableMarkdownNode {
  readonly type: string;
  readonly node: AstNode;
  readonly element: HTMLElement;

  constructor(type: string, node: AstNode, element: HTMLElement, className = '') {
    this.type = type;
    this.node = node;
    this.element = element;
    if (className) {
      element.className = className;
    }
    element.classList.add('markdown-node');
    element.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      // A node's rendering never navigates: the app owns its clicks, and a rendering that
      // happens to be an `<a>` — a footnote marker's `#fn-1` — would otherwise take the
      // webview to the fragment, which is a page jump on a click that meant "edit this".
      // (`nodes/link.ts` prevents it privately as well; this is the home for the rule.)
      event.preventDefault();
      // Resolve the root before placing the caret: overrides (e.g. an image
      // revealing its source) may detach `this.element`.
      const root = this.element.closest('.prose') as HTMLElement | null;
      this.placeCaretAt(event.clientX, event.clientY);
      // Move keyboard focus to the rendered document so arrow keys can steer
      // the caret (the root element is made focusable by the editor).
      root?.focus({ preventScroll: true });
    });
  }

  placeCaretAt(clientX: number, clientY: number): void {
    const range = caretRangeAtPoint(clientX, clientY);
    const isTextPosition =
      range !== null &&
      range.startContainer.nodeType === Node.TEXT_NODE &&
      this.element.contains(range.startContainer);
    if (isTextPosition) {
      showCaret(range);
      return;
    }
    this.placeCaretFallback(clientX);
  }

  /**
   * Leaf nodes without text (image, break, horizontal rule, ...) cannot resolve
   * a character under the pointer. For nodes with text the caret goes to the
   * nearest text boundary; otherwise it is placed at the node's own position.
   */
  private placeCaretFallback(clientX: number): void {
    const firstText = this.firstTextNode(this.element);
    const lastText = this.lastTextNode(this.element);

    if (firstText && lastText) {
      const startRange = this.collapsedRange(firstText, 0);
      const endRange = this.collapsedRange(lastText, lastText.data.length);
      // The ends are compared by where they sit on screen, which for an *empty* text node — the
      // placeholder an empty line, item or cell holds — is the line it sits on
      // (`caret/geometry.ts: caretLeft`), not the nothing the node itself measures as.
      const startLeft = caretLeft(firstText, 0);
      const endLeft = caretLeft(lastText, lastText.data.length);
      showCaret(Math.abs(startLeft - clientX) <= Math.abs(endLeft - clientX) ? startRange : endRange);
      return;
    }

    if (this.isVoidElement(this.element)) {
      showCaretBeside(this.element, clientX);
      return;
    }
    // An empty container (paragraph, list item, table cell, ...): place the
    // caret inside it so the local caret span gives the line a visible height.
    const range = document.createRange();
    range.setStart(this.element, 0);
    range.collapse(true);
    showCaret(range);
  }

  /** Whether the element renders without children (img, hr, br, ...). */
  private isVoidElement(element: HTMLElement): boolean {
    return ['IMG', 'HR', 'BR', 'INPUT', 'WBR'].includes(element.tagName);
  }

  private collapsedRange(node: Text, offset: number): Range {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    return range;
  }

  private firstTextNode(root: Node): Text | null {
    if (root.nodeType === Node.TEXT_NODE) {
      return root as Text;
    }
    for (let index = 0; index < root.childNodes.length; index += 1) {
      const found = this.firstTextNode(root.childNodes[index]);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private lastTextNode(root: Node): Text | null {
    if (root.nodeType === Node.TEXT_NODE) {
      return root as Text;
    }
    for (let index = root.childNodes.length - 1; index >= 0; index -= 1) {
      const found = this.lastTextNode(root.childNodes[index]);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
