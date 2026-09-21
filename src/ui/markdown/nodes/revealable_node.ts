/**
 * The contract for a node whose markdown can stand in for its rendering: the
 * source view that is built instead, and the click that enters it.
 *
 * May import: the node contract (`editable_node.ts`), `source_mode.ts` and the
 * parser's serializer (for the node's own markdown). Upholds: source mode is
 * decided from the document — the shape is settled before `super()`, so a node
 * never swaps its element behind the caret, and the block is rendered again when
 * the source has to appear or go.
 */

import type { RootContent } from 'mdast';
import { serializeMarkdown } from '../syntax/parser';
import { EditableNodeComponent } from './editable_node';
import { enterSourceOf, isShownSource } from '../source_mode';
import type { AstNode } from '../ast';

/** The markdown a node was made from. */
export function nodeSource(node: AstNode): string {
  return serializeMarkdown([node as RootContent]).trimEnd();
}

/** The class every source view carries, so a node can tell what it was built as. */
export const SOURCE_VIEW_CLASS = 'markdown-source-view';

/**
 * The element showing a node's own source, when the caret is inside it, or
 * null when the node should render its view.
 *
 * This runs *before* `super()`: what a node is built as is settled while it is
 * built, so no node ever swaps its element in the document, and the block it
 * lives in is simply rendered again when the source has to appear or go (see
 * `source_mode.ts`).
 *
 * The span is tagged with the block-relative offset its text starts at, so a
 * caret inside it maps back to the document exactly, and with the content
 * range, so arrow keys enter the source at the content boundary rather than on
 * a marker (see `caret/navigation.ts`). `fill` lets a node highlight its own
 * language, as long as the text comes out unchanged.
 */
export function sourceViewFor(
  node: AstNode,
  className: string,
  contentRange: (source: string) => { start: number; end: number },
  fill?: (element: HTMLElement, source: string) => void
): HTMLSpanElement | null {
  if (!isShownSource(node)) {
    return null;
  }
  const source = nodeSource(node);
  const span = document.createElement('span');
  span.className = `${SOURCE_VIEW_CLASS} ${className}`;
  const { start, end } = contentRange(source);
  span.dataset.contentStart = String(start);
  span.dataset.contentEnd = String(end);
  const position = (node as { position?: { start?: { offset?: number } } }).position;
  if (position?.start?.offset !== undefined) {
    span.dataset.sourceFrom = String(position.start.offset);
  }
  if (fill) {
    fill(span, source);
  } else {
    span.textContent = source;
  }
  return span;
}

/**
 * A node whose markdown source can stand in for its rendering.
 *
 * A link renders its title, a citation its formatted reference, an image its
 * picture: none of them holds the characters the author typed, so none of them
 * can hold a caret either. While the caret is inside one, the node is built as
 * its source text instead — the shape an inline code span always has — and the
 * block is rebuilt around it, exactly as a display formula's block is. There
 * is no revealed element to keep in step, no editing range to shift and no
 * source mode to stand down: the node is simply built again, in the other
 * shape, whenever the block is.
 *
 * Subclasses build their view after `super()` and return early when
 * {@link sourceShown}: the element they were given is already the source.
 */
export abstract class RevealableNodeComponent extends EditableNodeComponent {
  /** Whether this node was built as its own source rather than its view. */
  protected readonly sourceShown: boolean = this.element.classList.contains(SOURCE_VIEW_CLASS);
  /** The markdown this node shows and edits. */
  protected source(): string {
    return nodeSource(this.node);
  }
  /**
   * The absolute `[start, end)` range of the identifier content within the
   * serialized source — i.e. the source without its start/end markers
   * (`link` → the title, `[@key]` → `@key`, `[[target]]` → `target`, ...).
   */
  protected abstract sourceContentRange(source: string): { start: number; end: number };

  constructor(type: string, node: AstNode, element: HTMLElement, className = '') {
    super(type, node, element, className);
  }

  /**
   * A click on the rendering enters this node's source, at the end of its
   * content.
   *
   * The rendering cannot name a character — a title, a formatted reference and
   * a picture all say nothing about where in the source they came from — so the
   * entry point is the one position that is always true, and the author's next
   * click lands on the text itself, where the mapping is exact.
   */
  override placeCaretAt(clientX: number, clientY: number): void {
    if (this.sourceShown || !this.shouldReveal()) {
      super.placeCaretAt(clientX, clientY);
      return;
    }
    enterSourceOf(this.element, this.entryOffset());
  }

  /** Whether clicking shows the source (a link with none to show returns false). */
  protected shouldReveal(): boolean {
    return true;
  }

  /**
   * Where in the block's text a click on this node's rendering puts the caret:
   * the end of the node's content, which is a position the source always has.
   */
  protected entryOffset(): number {
    const position = (this.node as { position?: { start?: { offset?: number } } }).position;
    const start = position?.start?.offset ?? 0;
    return start + this.sourceContentRange(this.source()).end;
  }
}
