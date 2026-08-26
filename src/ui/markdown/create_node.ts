/**
 * Node component bootstrap: registers the editable component factory for
 * every mdast node type with the shared registry (see `registry.ts`).
 *
 * The node modules depend only on the registry, so this module — the single
 * place that imports both the registry and every node class — can register
 * them without creating the `create_node ↔ nodes/*` import cycle. Importing
 * this module (directly or via its re-exports) also triggers the
 * registrations.
 */

import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import type {
  AstBlockquote,
  AstBreak,
  AstCitation,
  AstCode,
  AstDelete,
  AstDescriptionDetails,
  AstDescriptionList,
  AstDescriptionTerm,
  AstEmphasis,
  AstFootnoteDefinition,
  AstFootnoteReference,
  AstHeading,
  AstHtml,
  AstImage,
  AstInlineCode,
  AstLink,
  AstList,
  AstListItem,
  AstParagraph,
  AstRoot,
  AstStrong,
  AstTable,
  AstText,
  AstThematicBreak,
  AstWikilink,
  AstNode
} from './ast';
import { appendChildren, createComponent, registerComponent } from './registry';
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

export { appendChildren };

/** Creates the editable component for an mdast node (see `registry.ts`). */
export function createNodeComponent(node: AstNode) {
  return createComponent(node);
}

registerComponent('root', (node) => new RootNode(node as AstRoot));
registerComponent('paragraph', (node) => new Paragraph(node as AstParagraph));
registerComponent('heading', (node) => new Heading(node as AstHeading));
registerComponent('blockquote', (node) => new Blockquote(node as AstBlockquote));
registerComponent('list', (node) => new List(node as AstList));
registerComponent('listItem', (node) => new ListItem(node as AstListItem));
registerComponent('descriptionlist', (node) => new DescriptionList(node as AstDescriptionList));
registerComponent('descriptionterm', (node) => new DescriptionTerm(node as AstDescriptionTerm));
registerComponent(
  'descriptiondetails',
  (node) => new DescriptionDetails(node as AstDescriptionDetails)
);
registerComponent('footnoteDefinition', (node) => new FootnoteDefinition(node as AstFootnoteDefinition));
registerComponent('footnoteReference', (node) => new FootnoteReference(node as AstFootnoteReference));
registerComponent('inlineMath', (node) => new InlineMath(node as InlineMathNode));
registerComponent('math', (node) => new DisplayMath(node as MathNode));
registerComponent('code', (node) => new CodeBlock(node as AstCode));
registerComponent('thematicBreak', (node) => new ThematicBreak(node as AstThematicBreak));
registerComponent('table', (node) => new Table(node as AstTable));
registerComponent('html', (node) => new HtmlBlock(node as AstHtml));
registerComponent('break', (node) => new Break(node as AstBreak));
registerComponent('inlineCode', (node) => new InlineCode(node as AstInlineCode));
registerComponent('emphasis', (node) => new Emphasis(node as AstEmphasis));
registerComponent('strong', (node) => new Strong(node as AstStrong));
registerComponent('delete', (node) => new Delete(node as AstDelete));
registerComponent('link', (node) => new Link(node as AstLink));
registerComponent('image', (node) => new Image(node as AstImage));
registerComponent('citation', (node) => new Citation(node as AstCitation));
registerComponent('wikilink', (node) => new Wikilink(node as AstWikilink));
registerComponent('text', (node) => new TextNode(node as AstText));
