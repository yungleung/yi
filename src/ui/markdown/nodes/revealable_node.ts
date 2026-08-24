import type { RootContent } from 'mdast';
import { caretRangeAtPoint, onCaretRangeChanged, setCaretRange } from '../caret/caret';
import { serializeMarkdown } from '../parser';
import { EditableNodeComponent } from './editable_node';
import type { AstNode } from '../ast';

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
      const inside = range !== null && this.sourceView.contains(range.startContainer);
      if (!inside) {
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

  /** Whether clicking reveals the source (links with no source to reveal return false). */
  protected shouldReveal(): boolean {
    return true;
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
    if (
      !range ||
      range.startContainer.nodeType !== Node.TEXT_NODE ||
      !this.element.contains(range.startContainer)
    ) {
      // The pointer can resolve just outside the element (e.g. the first
      // character's left edge lands in the preceding text). Fall back to a
      // proportional position within the element's rendered text, so clicks
      // at the boundaries map to the content start/end instead of missing.
      const rect = this.element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return Math.round(ratio * (this.element.textContent?.length ?? 0));
      }
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

    const sourceView = document.createElement('span');
    sourceView.className = sourceClassName;
    sourceView.textContent = source;
    this.sourceView = sourceView;

    this.element.replaceWith(sourceView);

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

  /** Swaps the revealed source back to the rendered element. */
  protected restoreSource(): void {
    if (!this.sourceView) {
      return;
    }
    this.sourceView.replaceWith(this.element);
    this.sourceView = null;
  }
}
