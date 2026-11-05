/**
 * Node component bootstrap: registers the editable component factory for
 * every mdast node type with the shared registry (see `registry.ts`).
 *
 * The node modules depend only on the registry, so this module — the single
 * place that imports both the registry and every node class — can register
 * them without creating the `create_node ↔ nodes/*` import cycle. Importing
 * this module triggers the registrations.
 *
 * May import: the registry and every node component — it is the one module that
 * may see both, which is what keeps the `create_node ↔ nodes/*` cycle from
 * existing. Upholds: which node types exist is one list, registered here and
 * read through the registry by the renderer and by source mode.
 */

import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import type {
  AstBlockquote,
  AstAutoReference,
  AstBreak,
  AstCallout,
  AstCitation,
  AstCode,
  AstDelete,
  AstDescriptionDetails,
  AstDescriptionList,
  AstDescriptionTerm,
  AstEmphasis,
  AstFootnoteDefinition,
  AstFootnoteReference,
  AstFigure,
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
  AstTheorem,
  AstWikilink
} from './ast';
import { registerComponent } from './registry';
import { RootNode } from './nodes/root';
import { Paragraph } from './nodes/paragraph';
import { Heading } from './nodes/heading';
import { Blockquote } from './nodes/blockquote';
import { Callout } from './nodes/callout';
import { List, ListItem } from './nodes/list';
import { DescriptionDetails, DescriptionList, DescriptionTerm } from './nodes/description';
import { FootnoteDefinition, FootnoteReference } from './nodes/footnote';
import { DisplayMath, InlineMath } from './nodes/math';
import { CodeBlock } from './nodes/code';
import { ThematicBreak } from './nodes/thematic_break';
import { Table } from './nodes/table';
import { HtmlBlock } from './nodes/html';
import { Break } from './nodes/break';
import { InlineCode } from './nodes/inline_code';
import { Emphasis } from './nodes/emphasis';
import { Strong } from './nodes/strong';
import { Delete } from './nodes/delete';
import { Link } from './nodes/link';
import { AutoReference } from './nodes/auto_reference';
import { Figure } from './nodes/figure';
import { Image } from './nodes/image';
import { Citation } from './nodes/citation';
import { Theorem } from './nodes/theorem';
import { Wikilink } from './nodes/wikilink';
import { TextNode } from './nodes/text';

registerComponent('root', (node) => new RootNode(node as AstRoot));
registerComponent('paragraph', (node) => new Paragraph(node as AstParagraph));
registerComponent('heading', (node) => new Heading(node as AstHeading));
registerComponent('blockquote', (node) => new Blockquote(node as AstBlockquote));
registerComponent('callout', (node) => new Callout(node as AstCallout));
registerComponent('list', (node) => new List(node as AstList));
registerComponent('listItem', (node) => new ListItem(node as AstListItem));
registerComponent('descriptionlist', (node) => new DescriptionList(node as AstDescriptionList));
registerComponent('descriptionterm', (node) => new DescriptionTerm(node as AstDescriptionTerm));
registerComponent(
  'descriptiondetails',
  (node) => new DescriptionDetails(node as AstDescriptionDetails)
);
registerComponent('footnoteDefinition', (node) => new FootnoteDefinition(node as AstFootnoteDefinition));
registerComponent('footnoteReference', (node) => new FootnoteReference(node as AstFootnoteReference), true);
registerComponent('inlineMath', (node) => new InlineMath(node as InlineMathNode), true);
registerComponent('math', (node) => new DisplayMath(node as MathNode), true);
registerComponent('code', (node) => new CodeBlock(node as AstCode));
registerComponent('thematicBreak', (node) => new ThematicBreak(node as AstThematicBreak), true);
registerComponent('table', (node) => new Table(node as AstTable));
registerComponent('html', (node) => new HtmlBlock(node as AstHtml));
registerComponent('break', (node) => new Break(node as AstBreak), true);
registerComponent('inlineCode', (node) => new InlineCode(node as AstInlineCode), true);
registerComponent('emphasis', (node) => new Emphasis(node as AstEmphasis), true);
registerComponent('strong', (node) => new Strong(node as AstStrong), true);
registerComponent('delete', (node) => new Delete(node as AstDelete), true);
registerComponent('link', (node) => new Link(node as AstLink), true);
registerComponent(
  'autoReference',
  (node) => new AutoReference(node as AstAutoReference),
  true
);
registerComponent('figure', (node) => new Figure(node as AstFigure), true);
registerComponent('image', (node) => new Image(node as AstImage), true);
registerComponent('citation', (node) => new Citation(node as AstCitation), true);
registerComponent('theorem', (node) => new Theorem(node as AstTheorem));
registerComponent('wikilink', (node) => new Wikilink(node as AstWikilink), true);
registerComponent('text', (node) => new TextNode(node as AstText));
