import type { Root, RootContent } from 'mdast';
import { caretRangeAtPoint, showCaret, showCaretBeside } from '../caret/caret';
import type { CitationNode } from '../plugins/remark-citation';

export type { CitationNode };

export type {
  Blockquote as MarkdownBlockquote,
  Break as MarkdownBreak,
  Code as MarkdownCode,
  Delete as MarkdownDelete,
  Emphasis as MarkdownEmphasis,
  FootnoteDefinition as MarkdownFootnoteDefinition,
  FootnoteReference as MarkdownFootnoteReference,
  Heading as MarkdownHeading,
  Html as MarkdownHtml,
  Image as MarkdownImage,
  InlineCode as MarkdownInlineCode,
  Link as MarkdownLink,
  List as MarkdownList,
  ListItem as MarkdownListItem,
  Paragraph as MarkdownParagraph,
  Root as MarkdownRoot,
  Strong as MarkdownStrong,
  Table as MarkdownTable,
  TableCell as MarkdownTableCell,
  Text as MarkdownText,
  ThematicBreak as MarkdownThematicBreak
} from 'mdast';

/** remark-deflist `<dl>` node, which ships no official types. */
export interface DescriptionListNode {
  type: 'descriptionlist';
  children: MarkdownNode[];
}

/** remark-deflist `<dt>` node, which ships no official types. */
export interface DescriptionTermNode {
  type: 'descriptionterm';
  children: MarkdownNode[];
}

/** remark-deflist `<dd>` node, which ships no official types. */
export interface DescriptionDetailsNode {
  type: 'descriptiondetails';
  children: MarkdownNode[];
}

// Register the remark-deflist nodes in the mdast type registry so they become
// part of `RootContent` (mdast-util-math already registers `math`/`inlineMath`
// itself, so those flow into `RootContent` without any local declaration).
declare module 'mdast' {
  interface RootContentMap {
    descriptionlist: DescriptionListNode;
    descriptionterm: DescriptionTermNode;
    descriptiondetails: DescriptionDetailsNode;
  }
}

/**
 * A markdown node rendered as an editable component.
 *
 * This is the marker contract every rendered node component implements:
 * - it is bound to an mdast node and exposes its rendered DOM element, and
 * - clicking inside it places a blinking caret right after the clicked character.
 */
export interface EditableMarkdownNode {
  /** The mdast node type this component renders (also acts as a capability marker). */
  readonly type: string;
  /** The mdast node this component is bound to. */
  readonly node: MarkdownNode;
  /** The rendered DOM element of this node. */
  readonly element: HTMLElement;
  /** Places the blinking caret right after the character under the given viewport point. */
  placeCaretAt(clientX: number, clientY: number): void;
}

/**
 * Any node shape the renderer may encounter: core mdast nodes plus the nodes
 * added by the remark plugins in use (math and deflists).
 */
export type MarkdownNode = Root | RootContent | CitationNode;

/**
 * Base class implementing the {@link EditableMarkdownNode} contract: every
 * node component listens for clicks and places the shared blinking caret right
 * after the clicked character.
 */
export abstract class EditableNodeComponent implements EditableMarkdownNode {
  readonly type: string;
  readonly node: MarkdownNode;
  readonly element: HTMLElement;

  constructor(type: string, node: MarkdownNode, element: HTMLElement, className = '') {
    this.type = type;
    this.node = node;
    this.element = element;
    if (className) {
      element.className = className;
    }
    element.classList.add('markdown-node');
    element.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
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
      const startLeft = startRange.getBoundingClientRect().left;
      const endLeft = endRange.getBoundingClientRect().left;
      showCaret(Math.abs(startLeft - clientX) <= Math.abs(endLeft - clientX) ? startRange : endRange);
      return;
    }

    showCaretBeside(this.element, clientX);
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
