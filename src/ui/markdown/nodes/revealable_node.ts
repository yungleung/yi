import type { RootContent } from 'mdast';
import {
  caretRangeAtPoint,
  getCaretRange,
  onCaretRangeChanged,
  refreshCaretPosition,
  setCaretRange
} from '../caret/caret';
import { elementBoundarySide, nextNodeAfter, nextNodeBefore } from '../caret/dom';
import { serializeMarkdown } from '../parser';
import { EditableNodeComponent } from './editable_node';
import type { AstNode } from '../ast';

/** Revealable components by their rendered element (for the caret watcher). */
const revealableByElement = new WeakMap<HTMLElement, RevealableNodeComponent>();

/**
 * Base class for node components that toggle between their rendered view and
 * their markdown source (image, link, citation, wikilink, math, ...).
 * Clicking reveals the source with the caret at the offset given by
 * {@link sourceOffsetForClick}; the rendered view returns as soon as the
 * caret leaves the source or disappears.
 */
export abstract class RevealableNodeComponent extends EditableNodeComponent {
  /** The CSS class of the revealed source span. */
  protected sourceView: HTMLSpanElement | null = null;
  protected abstract readonly sourceClassName: string;
  /**
   * The absolute `[start, end)` range of the identifier content within the
   * serialized source — i.e. the source without its start/end markers
   * (`link` → the title, `[@key]` → `@key`, `[[target]]` → `target`, ...).
   * The click-mapped caret is kept inside this range.
   */
  protected abstract sourceContentRange(source: string): { start: number; end: number };
  private unsubscribeCaret: () => void = () => {};

  constructor(type: string, node: AstNode, element: HTMLElement, className = '') {
    super(type, node, element, className);
    revealableByElement.set(element, this);
    ensureRevealWatcher();

    // The source view stays open only while the caret is inside it; when the
    // caret moves elsewhere (or disappears), re-render the original element.
    this.unsubscribeCaret = onCaretRangeChanged((range) => {
      if (!this.sourceView) {
        // Self-clean when this component is re-rendered out of the document.
        if (!this.element.isConnected) {
          this.unsubscribeCaret();
        }
        return;
      }
      const touched = range !== null && touchesElement(range, this.sourceView);
      if (!touched) {
        this.restoreSource();
      }
    });
  }

  /**
   * Reveals the source when clicked, placing the caret at the offset mapped
   * from the click position (see {@link sourceOffsetForClick}).
   */
  override placeCaretAt(clientX: number, clientY: number): void {
    if (!this.shouldReveal()) {
      super.placeCaretAt(clientX, clientY);
      return;
    }
    this.revealSource(this.sourceClassName, this.sourceOffsetForClick(clientX, clientY));
  }

  /**
   * Reveals the source with the caret placed according to a DOM range:
   * mapped from the range when the caret is inside the element, or at the
   * content start/end when the caret sits on the element's boundary.
   */
  revealAtRange(range: Range): void {
    if (!this.shouldReveal()) {
      return;
    }
    const container = range.startContainer;
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    if (this.element.contains(container)) {
      const clicked = this.offsetFromRange(range);
      this.revealSource(
        this.sourceClassName,
        clicked === undefined ? undefined : this.contentOffset(clicked, source)
      );
      return;
    }
    // The caret sits on the element's boundary: reveal the source in place
    // without moving the caret out of the surrounding text.
    this.revealSourceAtBoundary(this.sourceClassName);
  }

  /** Whether clicking reveals the source (links with no source to reveal return false). */
  protected shouldReveal(): boolean {
    return true;
  }

  /** Whether the source is currently revealed. */
  isSourceVisible(): boolean {
    return this.sourceView !== null;
  }

  /**
   * Maps a click inside the rendered element to an offset in the revealed
   * source. The default maps the clicked character offset in the rendered
   * text into the identifier content with `min(clicked, content length)` and
   * adds the start marker, so the caret never lands on a marker. Subclasses
   * with a special geometry (images, display math) override this.
   */
  protected sourceOffsetForClick(clientX: number, clientY: number): number | undefined {
    const clicked = this.clickedTextOffset(clientX, clientY);
    if (clicked === undefined) {
      return undefined;
    }
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    return this.contentOffset(clicked, source);
  }

  /** Maps a content-relative offset into the absolute source range. */
  protected contentOffset(clicked: number | undefined, source: string): number | undefined {
    if (clicked === undefined) {
      return undefined;
    }
    const { start, end } = this.sourceContentRange(source);
    return start + Math.min(Math.max(0, clicked), Math.max(0, end - start));
  }

  /**
   * The character offset of the click within the element's rendered text
   * content, or `undefined` when the click is not on that text.
   */
  protected clickedTextOffset(clientX: number, clientY: number): number | undefined {
    const range = caretRangeAtPoint(clientX, clientY);
    const offset = range ? this.offsetFromRange(range) : undefined;
    if (offset !== undefined) {
      return offset;
    }
    // The pointer can resolve just outside the element (e.g. the first
    // character's left edge lands in the preceding text). Fall back to a
    // proportional position within the element's rendered text, so clicks at
    // the boundaries map to the content start/end instead of missing.
    const rect = this.element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (this.element.textContent?.length ?? 0));
    }
    return undefined;
  }

  /** The caret's offset within the element's text content, or undefined. */
  protected offsetFromRange(range: Range): number | undefined {
    const container = range.startContainer;
    if (
      container.nodeType !== Node.TEXT_NODE ||
      !this.element.contains(container)
    ) {
      return undefined;
    }
    let offset = 0;
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        return offset + range.startOffset;
      }
      offset += (node as Text).data.length;
    }
    return undefined;
  }

  /** Replaces the rendered element with its markdown source. */
  protected revealSource(sourceClassName: string, caretOffset?: number): void {
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    const { start, end } = this.sourceContentRange(source);
    const sourceView = this.swapToSource(sourceClassName);

    const textNode = sourceView.firstChild as Text;
    const offset =
      caretOffset === undefined
        ? end
        : Math.min(Math.max(start, caretOffset), end);
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.collapse(true);
    setCaretRange(range);
  }

  /**
   * Reveals the source without moving the caret (used when the caret sits on
   * the element's boundary, in the surrounding text).
   */
  protected revealSourceAtBoundary(sourceClassName: string): void {
    this.swapToSource(sourceClassName);
  }

  /** Replaces the rendered element with the tagged source span. */
  private swapToSource(sourceClassName: string): HTMLSpanElement {
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    const sourceView = document.createElement('span');
    sourceView.className = sourceClassName;
    sourceView.textContent = source;
    // Tag the source's block-relative raw start so the caret inside the
    // revealed source can be mapped back to the document: the global offset
    // is the block's `charStart` plus this value (see `position.ts`).
    // Positions come from the whole-document parse today, so subtract the
    // block's char start; once blocks are parsed independently the node
    // position is already block-relative and this becomes the raw value.
    const position = (
      this.node as { position?: { start: { offset?: number } } }
    ).position;
    const blockCharStart = Number(
      (this.element.closest('.markdown-block') as HTMLElement | null)?.dataset.charStart
    );
    if (position?.start.offset !== undefined && Number.isFinite(blockCharStart)) {
      sourceView.dataset.sourceFrom = String(position.start.offset - blockCharStart);
    }
    this.sourceView = sourceView;

    // Replacing the element moves an element-anchored caret range to the
    // wrong side of the swap; re-anchor it to the same boundary of the new
    // source span so the caret stays where it was.
    const side = elementBoundarySide(getCaretRange(), this.element);
    this.element.replaceWith(sourceView);
    if (side) {
      const range = document.createRange();
      if (side === 'before') {
        range.setStartBefore(sourceView);
      } else {
        range.setStartAfter(sourceView);
      }
      range.collapse(true);
      setCaretRange(range);
    }
    // The swap changes the layout; re-anchor the positioned caret to the
    // active range so it does not drift.
    refreshCaretPosition();
    return sourceView;
  }

  /** Swaps the revealed source back to the rendered element. */
  protected restoreSource(): void {
    if (!this.sourceView) {
      return;
    }
    this.sourceView.replaceWith(this.element);
    this.sourceView = null;
    refreshCaretPosition();
  }
}

let revealWatcher: (() => void) | null = null;

/**
 * Subscribes once to caret moves: whenever the caret enters a revealable
 * element or sits on its boundary, the node reveals its source, so the
 * editor never has to map the caret through a formatted (unrevealed) widget.
 */
function ensureRevealWatcher(): void {
  if (revealWatcher) {
    return;
  }
  revealWatcher = onCaretRangeChanged(() => {
    // Defer until the current caret notification finishes: the per-component
    // listeners may restore sources (which changes the DOM), and revealing
    // replaces an element and moves the caret. Checking afterwards sees the
    // settled state.
    queueMicrotask(() => {
      const current = getCaretRange();
      if (!current) {
        return;
      }
      const component = nearestTouchedRevealable(current);
      if (component && !component.isSourceVisible()) {
        component.revealAtRange(current);
      }
    });
  });
}

/** The nearest revealable component the caret is inside or adjacent to. */
function nearestTouchedRevealable(range: Range | null): RevealableNodeComponent | null {
  if (!range) {
    return null;
  }
  const container = range.startContainer;
  const found = fromContainer(container);
  if (found) {
    return found;
  }
  // Revealables only reveal when the caret is in the same block and at their
  // boundary; blocks are separated by blank lines in the source, so a caret
  // at a block edge must not reveal content in the neighbouring block.
  const block = (
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element)
  )?.closest('.markdown-block');
  const after = nextNodeAfter(container, range.startOffset);
  const before = nextNodeBefore(container, range.startOffset);
  for (const [adjacent, forward] of [
    [after, true],
    [before, false]
  ] as [Node | null, boolean][]) {
    if (!adjacent) {
      continue;
    }
    const candidate =
      fromContainer(adjacent) ??
      // The neighbouring node can be a container (e.g. a block holding an
      // image): look inside it for the revealable nearest to the caret.
      revealableInside(adjacent, forward);
    if (candidate && block?.contains(candidate.element)) {
      return candidate;
    }
  }
  return null;
}

/**
 * The revealable component inside an element, nearest to the caret side:
 * the first in document order when the caret is before it, the last when the
 * caret is after it.
 */
function revealableInside(node: Node, forward: boolean): RevealableNodeComponent | null {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  let found: HTMLElement | null = null;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const component = revealableByElement.get(current as HTMLElement);
    if (component) {
      found = current as HTMLElement;
      if (forward) {
        break;
      }
    }
  }
  return found ? (revealableByElement.get(found) ?? null) : null;
}

function fromContainer(node: Node): RevealableNodeComponent | null {
  let element: Element | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  while (element && element !== document.body) {
    const component = revealableByElement.get(element as HTMLElement);
    if (component) {
      return component;
    }
    element = element.parentElement;
  }
  return null;
}

/** Whether a caret position is inside an element or at either boundary. */
function touchesElement(range: Range, element: HTMLElement): boolean {
  if (element.contains(range.startContainer)) {
    return true;
  }
  const after = nextNodeAfter(range.startContainer, range.startOffset);
  if (after !== null && element.contains(after)) {
    return true;
  }
  const before = nextNodeBefore(range.startContainer, range.startOffset);
  if (before !== null && element.contains(before)) {
    return true;
  }
  return false;
}
