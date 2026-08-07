/**
 * The markdown AST node types used by the editor: the core mdast nodes plus
 * the custom nodes registered by the remark plugins (see `mdast.d.ts`).
 */
import type { Root, RootContent, RootContentMap } from 'mdast';

export type {
  Blockquote as AstBlockquote,
  Break as AstBreak,
  Code as AstCode,
  Delete as AstDelete,
  Emphasis as AstEmphasis,
  FootnoteDefinition as AstFootnoteDefinition,
  FootnoteReference as AstFootnoteReference,
  Heading as AstHeading,
  Html as AstHtml,
  Image as AstImage,
  InlineCode as AstInlineCode,
  Link as AstLink,
  List as AstList,
  ListItem as AstListItem,
  Paragraph as AstParagraph,
  Root as AstRoot,
  Strong as AstStrong,
  Table as AstTable,
  TableCell as AstTableCell,
  Text as AstText,
  ThematicBreak as AstThematicBreak
} from 'mdast';

/**
 * Custom node types registered into mdast via `mdast.d.ts`. The augmentation
 * adds them to `RootContentMap`, so they are addressed through the map (there
 * is no named export for them on the `mdast` module itself).
 */
export type AstCitation = RootContentMap['citation'];
export type AstWikilink = RootContentMap['wikilink'];
export type AstDescriptionList = RootContentMap['descriptionlist'];
export type AstDescriptionTerm = RootContentMap['descriptionterm'];
export type AstDescriptionDetails = RootContentMap['descriptiondetails'];

/** Any node shape the renderer may encounter. */
export type AstNode = Root | RootContent;
