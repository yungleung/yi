import {
  EditableNodeComponent,
  type EditableMarkdownNode
} from './nodes/editable_node';
import type { AstNode } from './ast';
import { RootNode } from './nodes/root';
import { Paragraph } from './nodes/paragraph';
import { Heading } from './nodes/heading';
import { Blockquote } from './nodes/blockquote';
import { List, ListItem } from './nodes/list';
import { DescriptionDetails, DescriptionList, DescriptionTerm } from './nodes/description';
import { FootnoteDefinition, FootnoteReference } from './nodes/footnote';
import { DisplayMath, InlineMath } from './nodes/math';
import { CodeBlock } from './nodes/code_block';
import { ThematicBreak } from './nodes/thematic_break';
import { Table } from './nodes/table';
import { HtmlBlock } from './nodes/html';
import { Break } from './nodes/break';
import { InlineCode } from './nodes/inline_code';
import { Emphasis } from './nodes/emphasis';
import { Strong } from './nodes/strong';
import { Delete } from './nodes/delete';
import { Link } from './nodes/link';
import { Image } from './nodes/image';
import { Citation } from './nodes/citation';
import { Wikilink } from './nodes/wikilink';
import { TextNode } from './nodes/text';

/**
 * Builds the editable component for an mdast node, or `null` for nodes that
 * are not rendered (image references and definitions are resolved elsewhere).
 */
export function createNodeComponent(node: AstNode): EditableMarkdownNode | null {
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
    case 'citation':
      return new Citation(node);
    case 'wikilink':
      return new Wikilink(node);
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
  children: readonly AstNode[] | undefined
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
  constructor(node: AstNode) {
    super(String(node.type ?? 'unknown'), node, document.createElement('div'), 'min-w-0');
    appendChildren(this.element, 'children' in node ? node.children : undefined);
  }
}
