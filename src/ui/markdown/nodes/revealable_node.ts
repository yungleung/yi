import type { RootContent } from 'mdast';
import {
  caretRangeAtPoint,
  getCaretRange,
  onCaretRangeChanged,
  refreshCaretPosition,
  setCaretRange
} from '../caret/caret';
import {
  elementBoundarySide,
  firstPositionableIn,
  lastPositionableIn,
  nextNodeAfter,
  nextNodeBefore
} from '../caret/dom';
import { serializeMarkdown } from '../parser';
import { sourceTextPosition } from '../position';
import { EditableNodeComponent } from './editable_node';
import type { AstNode } from '../ast';
import { preserveSpaces } from './text';

/** Revealable components by their rendered element (for the caret watcher). */
const revealableByElement = new WeakMap<HTMLElement, RevealableNodeComponent>();

/** The revealables alive in the document, so one can be found after a rebuild. */
const liveRevealables = new Set<RevealableNodeComponent>();

/**
 * The source the author is *editing*, as a range of the raw document.
 *
 * Source mode is editing state, not a side effect of where the caret happens
 * to be: it has to outlive the block being re-rendered, which rebuilds every
 * node in it. While this is set, the node keeps showing its source across the
 * rebuild — so the caret, which the editor restores by offset a moment later,
 * is placed inside the source text, where its position is exact. Without it the
 * rebuilt node shows its rendering again, and the caret is restored into
 * something whose text has nothing to do with the source (a formula is KaTeX).
 *
 * It is kept in document offsets, so it names the same node after a re-parse,
 * and the editor shifts it through each edit.
 */
let editingSource: { from: number; to: number; caret: number } | null = null;

/** Notes that a source is being edited, and where the caret sits in it. */
export function setEditingSource(from: number, to: number, caret: number): void {
  editingSource = { from, to, caret };
}

/** Stops editing: the next time the node is rebuilt it renders again. */
export function clearEditingSource(): void {
  editingSource = null;
}

/** Whether a document offset is inside the source being edited. */
export function insideEditingSource(offset: number): boolean {
  return (
    editingSource !== null && offset >= editingSource.from && offset <= editingSource.to
  );
}

/** Where the caret goes inside the source being edited. */
export function editingSourceCaret(): number | null {
  return editingSource ? editingSource.caret : null;
}

/** Moves the editing range through an edit, so it keeps naming the same node. */
export function shiftEditingSource(from: number, to: number, replacement: string): void {
  if (!editingSource) {
    return;
  }
  const delta = replacement.length - (to - from);
  const shift = (offset: number): number => (offset >= to ? offset + delta : offset);
  editingSource = {
    from: shift(editingSource.from),
    to: shift(editingSource.to),
    caret: shift(editingSource.caret)
  };
}

/** Puts the caret's place in the editing source where the editor is putting it. */
export function setEditingSourceCaret(offset: number): void {
  if (editingSource && insideEditingSource(offset)) {
    editingSource = { ...editingSource, caret: offset };
  }
}

/**
 * Re-opens the source being edited after its block was rebuilt. Returns
 * whether one was found and opened.
 */
export function resumeEditingSource(): boolean {
  const editing = editingSource;
  if (!editing) {
    return false;
  }
  for (const revealable of [...liveRevealables]) {
    const range = revealable.sourceRangeInDocument();
    if (!range) {
      if (!revealable.isAttached()) {
        liveRevealables.delete(revealable);
      }
      continue;
    }
    if (range.start === editing.from && range.end === editing.to) {
      revealable.revealSourceAt(editing.caret);
      return true;
    }
  }
  return false;
}

/**
 * How to read the caret's offset in the raw document, or null when no editor
 * is running. The editor registers it: a node component cannot work this out
 * for itself, because the offset depends on the whole document's parsing.
 *
 * It matters when the caret comes back into a node it was already in — after
 * an edit inside a revealed source, say. Mapping the caret's position in the
 * *rendering* instead would be a guess: a display formula renders as KaTeX,
 * whose text has nothing to do with the source's length, so the caret lands
 * somewhere proportional rather than where the author left it.
 */
let caretRawOffset: (() => number | null) | null = null;

export function setCaretRawOffsetResolver(resolver: (() => number | null) | null): void {
  caretRawOffset = resolver;
}

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
  /** The markdown this node shows and edits. */
  protected source(): string {
    return serializeMarkdown([this.node as RootContent]).trimEnd();
  }
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
    liveRevealables.add(this);
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
      if (touched) {
        return;
      }
      // A source being edited stays open while the caret is between
      // placements — that is exactly what an edit does to it. It closes when
      // the caret comes to rest outside the source, or when the editor stops
      // editing it.
      const caret = caretRawOffset?.();
      if (
        this.isBeingEdited() &&
        (caret === null || caret === undefined || insideEditingSource(caret))
      ) {
        return;
      }
      clearEditingSource();
      this.restoreSource();
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
    // The caret's own offset in the document is exact; take it when it falls
    // inside this node, rather than mapping a position in the rendering.
    const exact = this.caretOffsetInSource();
    if (exact !== null) {
      const range = this.sourceRangeInDocument();
      if (range) {
        // The author's caret is in this source: it is being edited, and stays
        // in source mode until the caret comes to rest somewhere else.
        setEditingSource(range.start, range.end, range.start + exact);
      }
      this.revealSource(this.sourceClassName, exact);
      return;
    }
    const container = range.startContainer;
    const source = this.source();
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

  /**
   * Where the caret sits inside this node's source, when the editor can say
   * and the caret is in fact inside it.
   */
  private caretOffsetInSource(): number | null {
    const offset = caretRawOffset?.();
    const range = this.sourceRangeInDocument();
    if (offset === null || offset === undefined || !range) {
      return null;
    }
    return offset >= range.start && offset <= range.end ? offset - range.start : null;
  }

  /** Whether clicking reveals the source (links with no source to reveal return false). */
  protected shouldReveal(): boolean {
    return true;
  }

  /** Whether the source is currently revealed. */
  isSourceVisible(): boolean {
    return this.sourceView !== null;
  }

  /** Whether this node's source is the one the author is editing. */
  isBeingEdited(): boolean {
    const range = this.sourceRangeInDocument();
    return range !== null && editingSource !== null && range.start === editingSource.from;
  }

  /** Whether this node is still part of the rendered document. */
  isAttached(): boolean {
    return this.element.isConnected || (this.sourceView?.isConnected ?? false);
  }

  /** Reveals this node's source with the caret at a document offset inside it. */
  revealSourceAt(offset: number): void {
    const range = this.sourceRangeInDocument();
    if (!range) {
      return;
    }
    this.revealSource(this.sourceClassName, offset - range.start);
  }

  /** This node's own raw range in the document, or null when it has none. */
  sourceRangeInDocument(): { start: number; end: number } | null {
    const blockElement = (this.sourceView ?? this.element).closest('.markdown-block');
    const charStart = Number((blockElement as HTMLElement | null)?.dataset.charStart ?? NaN);
    const relative = (this.node as { position?: { start: { offset?: number } } }).position?.start
      .offset;
    if (!Number.isFinite(charStart) || relative === undefined) {
      return null;
    }
    const length = this.source().length;
    return { start: charStart + relative, end: charStart + relative + length };
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
    const source = this.source();
    return this.contentOffset(clicked, source);
  }

  /**
   * Maps an offset in the rendered text into the absolute source range. The
   * rendered text can differ in length from the source (e.g. a formatted
   * citation), so the offset is normalized proportionally over the content.
   */
  protected contentOffset(clicked: number | undefined, source: string): number | undefined {
    if (clicked === undefined) {
      return undefined;
    }
    const { start, end } = this.sourceContentRange(source);
    const contentLength = Math.max(0, end - start);
    const renderedLength = this.element.textContent?.length ?? 0;
    if (renderedLength > 0 && contentLength > 0) {
      const ratio = Math.min(1, Math.max(0, clicked / renderedLength));
      return start + Math.round(ratio * contentLength);
    }
    return start + Math.min(Math.max(0, clicked), contentLength);
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
    // Already open: put the caret in the source rather than swapping again.
    // The swap replaces the element this component listens on, and that
    // element is gone once the source is showing — a second swap would leave
    // the new span detached, with the caret inside it.
    if (this.sourceView?.isConnected) {
      this.placeCaretInSourceView(caretOffset);
      return;
    }
    this.swapToSource(sourceClassName);
    this.placeCaretInSourceView(caretOffset);
  }

  /**
   * Puts the caret inside the revealed source, clamped to the node's content
   * (the range without its markers). Without an offset it lands at the end,
   * which is where a reveal that was not aimed at a character belongs.
   */
  protected placeCaretInSourceView(caretOffset?: number): void {
    const sourceView = this.sourceView;
    if (!sourceView) {
      return;
    }
    const source = this.source();
    const { start, end } = this.sourceContentRange(source);
    const offset = caretOffset === undefined ? end : Math.min(Math.max(start, caretOffset), end);
    // Over the span's whole text: the source may be highlighted into many
    // nodes, and the caret is placed by character.
    const position = sourceTextPosition(sourceView, offset);
    if (!position) {
      return;
    }
    const range = document.createRange();
    range.setStart(position.node, position.offset);
    range.collapse(true);
    setCaretRange(range);
  }

  /**
   * Reveals the source without moving the caret (used when the caret sits on
   * the element's boundary, in the surrounding text).
   */
  protected revealSourceAtBoundary(sourceClassName: string): void {
    if (this.sourceView?.isConnected) {
      return;
    }
    this.swapToSource(sourceClassName);
  }

  /** Replaces the rendered element with the tagged source span. */
  private swapToSource(sourceClassName: string): HTMLSpanElement {
    const source = this.source();
    const restoreSelection = this.captureSelectionForSwap(source);
    const { start, end } = this.sourceContentRange(source);
    const sourceView = document.createElement('span');
    sourceView.className = sourceClassName;
    this.fillSourceView(sourceView, source);
    // The identifier content range (without the raw markers), stored on the
    // span so caret navigation can enter the source at the content boundary
    // instead of on a marker (see `caret/navigation.ts`).
    sourceView.dataset.contentStart = String(start);
    sourceView.dataset.contentEnd = String(end);
    // Tag the source's block-relative raw start so the caret inside the
    // revealed source can be mapped back to the document: the global offset
    // is the block's `charStart` plus this value (see `position.ts`).
    // Node positions are block-relative (each block parses its own slice).
    const position = (
      this.node as { position?: { start: { offset?: number } } }
    ).position;
    if (position?.start.offset !== undefined) {
      sourceView.dataset.sourceFrom = String(position.start.offset);
    }
    this.sourceView = sourceView;
    this.attachSourceClick(sourceView);

    // Replacing the element moves an element-anchored caret range to the
    // wrong side of the swap; re-anchor it to the same boundary of the new
    // source span so the caret stays where it was.
    const side = elementBoundarySide(getCaretRange(), this.element);
    // Whichever of the two is in the document is the one to replace: after an
    // earlier swap the element is detached and the previous span is not.
    const showing = this.sourceView?.isConnected ? this.sourceView : this.element;
    showing.replaceWith(sourceView);
    // The browser would otherwise re-anchor a live drag selection onto the
    // replacement unpredictably (empty, or the whole source span).
    restoreSelection();
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

  /**
   * Fills the revealed span with the source. The default keeps visible the
   * spaces markdown would drop; a subclass with a language of its own — LaTeX,
   * for one — may highlight it instead, as long as the *text* comes out
   * unchanged: the caret inside the source is placed by character offset over
   * that text.
   */
  protected fillSourceView(sourceView: HTMLSpanElement, source: string): void {
    sourceView.textContent = preserveSpaces(source);
  }

  /**
   * A click into the revealed source is a click into the text being edited.
   *
   * The span replaced the element this component listens on, so it has to
   * handle its own clicks: without that the click reaches the editor as a
   * click on empty space beside a block, which snaps the caret to the block's
   * edge — the far end of a display formula, say, however far into it the
   * pointer was.
   */
  private attachSourceClick(sourceView: HTMLSpanElement): void {
    sourceView.addEventListener('click', (event) => {
      event.stopPropagation();
      const range = caretRangeAtPoint(event.clientX, event.clientY);
      if (range && sourceView.contains(range.startContainer)) {
        setCaretRange(range);
        return;
      }
      // The pointer is in the source's padding rather than on its text: take
      // the offset this node's own click mapping gives.
      this.placeCaretInSourceView(this.sourceOffsetForClick(event.clientX, event.clientY));
    });
  }

  /**
   * Captures a live (non-collapsed) native selection that touches this
   * element before the source swap, and returns a restore function that
   * rebuilds the selection on the revealed source. Boundaries inside the
   * rendered element are mapped proportionally onto the source content (the
   * same mapping as clicks), so dragging across a revealable keeps a correct
   * selection instead of dropping it or selecting the whole source.
   */
  private captureSelectionForSwap(source: string): () => void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return () => {};
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      return () => {};
    }
    const startInside = this.touchesElementNode(range.startContainer);
    const endInside = this.touchesElementNode(range.endContainer);
    // A drag can also run fully across the element (boundaries on both
    // sides). Those boundaries survive the swap, but the browser's highlight
    // must be refreshed afterwards or it renders empty.
    const spansElement =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE &&
      (range.commonAncestorContainer as Element).contains(this.element);
    if (!startInside && !endInside && !spansElement) {
      return () => {};
    }
    const anchor = this.selectionBoundary(range, true, source);
    const focus = this.selectionBoundary(range, false, source);
    return () => {
      const sourceView = this.sourceView;
      if (!sourceView) {
        return;
      }
      const anchorPoint =
        anchor.kind === 'inside' ? sourceTextPosition(sourceView, anchor.offset) : anchor;
      const focusPoint =
        focus.kind === 'inside' ? sourceTextPosition(sourceView, focus.offset) : focus;
      if (!anchorPoint || !focusPoint) {
        return;
      }
      const restored = document.createRange();
      restored.setStart(anchorPoint.node, anchorPoint.offset);
      restored.setEnd(focusPoint.node, focusPoint.offset);
      selection.removeAllRanges();
      selection.addRange(restored);
    };
  }

  /**
   * A selection boundary re-anchored onto the revealed source: either a
   * mapped offset inside the source text, or the original node/offset when
   * the boundary lies outside this element.
   */
  private selectionBoundary(
    range: Range,
    isAnchor: boolean,
    source: string
  ): { kind: 'inside'; offset: number } | { kind: 'outside'; node: Node; offset: number } {
    const node = isAnchor ? range.startContainer : range.endContainer;
    const offset = isAnchor ? range.startOffset : range.endOffset;
    if (node.nodeType === Node.TEXT_NODE && this.element.contains(node)) {
      const probe = document.createRange();
      probe.setStart(node, offset);
      probe.collapse(true);
      const clicked = this.offsetFromRange(probe);
      const mapped =
        clicked === undefined ? undefined : this.contentOffset(clicked, source);
      if (mapped !== undefined) {
        // The source span is a single text node; the mapped offset is
        // relative to the same source string.
        return { kind: 'inside', offset: mapped };
      }
    }
    return { kind: 'outside', node, offset };
  }

  /** Whether a node is this element or lives inside it. */
  private touchesElementNode(node: Node): boolean {
    return node === this.element || this.element.contains(node);
  }

  /** Swaps the revealed source back to the rendered element. */
  protected restoreSource(): void {
    const showing = this.sourceView;
    if (!showing) {
      return;
    }
    this.sourceView = null;
    showing.replaceWith(this.element);
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
      revealableAtEdge(adjacent, forward);
    if (candidate && block?.contains(candidate.element)) {
      return candidate;
    }
  }
  return null;
}

/**
 * The revealable component at the edge of a container node, nearest to the
 * caret side: the first positionable node when the caret is before it, the
 * last when the caret is after it. A revealable further inside the container
 * is not adjacent to the caret and must not reveal (e.g. a link at the end
 * of the next list item).
 */
function revealableAtEdge(node: Node, forward: boolean): RevealableNodeComponent | null {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const edge = forward ? firstPositionableIn(node) : lastPositionableIn(node);
  return edge ? fromContainer(edge) : null;
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
