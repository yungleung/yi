import type { RootContent } from 'mdast';
import { onCaretRangeChanged, setCaretRange } from '../caret/caret';
import { serializeMarkdown } from '../parser';
import { EditableNodeComponent } from './editable_node';
import type { AstNode } from '../ast';

/**
 * Base class for node components that toggle between their rendered view and
 * their markdown source (image, link, ...). Clicking reveals the source with
 * the caret at the last position; the rendered view returns as soon as the
 * caret leaves the source or disappears.
 */
export abstract class RevealableNodeComponent extends EditableNodeComponent {
  protected sourceView: HTMLSpanElement | null = null;
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
   * Replaces the rendered element with its markdown source and places the
   * caret after the last character, ready for source editing.
   */
  protected revealSource(sourceClassName: string): void {
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();

    const sourceView = document.createElement('span');
    sourceView.className = sourceClassName;
    sourceView.textContent = source;
    this.sourceView = sourceView;

    this.element.replaceWith(sourceView);

    const textNode = sourceView.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
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
