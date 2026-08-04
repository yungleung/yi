import {
  EditableNodeComponent,
  type EditableMarkdownNode,
  type MarkdownNode
} from './editable_node';
import { RootNode } from './root';
import { Paragraph } from './paragraph';
import { Heading } from './heading';
import { Blockquote } from './blockquote';
import { List, ListItem } from './list';
import { DescriptionDetails, DescriptionList, DescriptionTerm } from './description';
import { FootnoteDefinition, FootnoteReference } from './footnote';
import { DisplayMath, InlineMath } from './math';
import { CodeBlock } from './code_block';
import { ThematicBreak } from './thematic_break';
import { Table } from './table';
import { HtmlBlock } from './html';
import { Break } from './break';
import { InlineCode } from './inline_code';
import { Emphasis } from './emphasis';
import { Strong } from './strong';
import { Delete } from './delete';
import { Link } from './link';
import { Image } from './image';
import { TextNode } from './text';

/**
 * Builds the editable component for an mdast node, or `null` for nodes that
 * are not rendered (image references and definitions are resolved elsewhere).
 */
export function createNodeComponent(node: MarkdownNode): EditableMarkdownNode | null {
  switch (node.type) {
    case 'root':
      return new RootNode(node);
    case 'paragraph':
      return new Paragraph(node);
    case 'heading':
      return new Heading(node);
    case 'blockquote':
      return new Blockquote(node);
    case 'list':
      return new List(node);
    case 'listItem':
      return new ListItem(node);
    case 'descriptionlist':
      return new DescriptionList(node);
    case 'descriptionterm':
      return new DescriptionTerm(node);
    case 'descriptiondetails':
      return new DescriptionDetails(node);
    case 'footnoteDefinition':
      return new FootnoteDefinition(node);
    case 'footnoteReference':
      return new FootnoteReference(node);
    case 'inlineMath':
      return new InlineMath(node);
    case 'math':
      return new DisplayMath(node);
    case 'code':
      return new CodeBlock(node);
    case 'thematicBreak':
      return new ThematicBreak(node);
    case 'table':
      return new Table(node);
    case 'html':
      return new HtmlBlock(node);
    case 'break':
      return new Break(node);
    case 'inlineCode':
      return new InlineCode(node);
    case 'emphasis':
      return new Emphasis(node);
    case 'strong':
      return new Strong(node);
    case 'delete':
      return new Delete(node);
    case 'link':
      return new Link(node);
    case 'image':
      return new Image(node);
    case 'text':
      return new TextNode(node);
    case 'imageReference':
    case 'definition':
      return null;
    default:
      return new GenericContainer(node);
  }
}

/** Renders every child of an mdast node into the given container element. */
export function appendChildren(
  container: HTMLElement,
  children: readonly MarkdownNode[] | undefined
): void {
  for (const child of children ?? []) {
    const component = createNodeComponent(child);
    if (component) {
      container.appendChild(component.element);
    }
  }
}

/** Fallback for unknown node types: a generic block container. */
class GenericContainer extends EditableNodeComponent {
  constructor(node: MarkdownNode) {
    super(String(node.type ?? 'unknown'), node, document.createElement('div'), 'min-w-0');
    appendChildren(this.element, 'children' in node ? node.children : undefined);
  }
}
