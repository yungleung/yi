/**
 * Registers the custom markdown node types used by the editor's plugins in
 * mdast's type registry, so they flow into `RootContent` (and phrasing
 * content where applicable).
 *
 * May import: the plugin node types it registers and the mdast types it extends.
 * Upholds: the custom constructs are declared once — a plugin's node flows into
 * `RootContent` from here, so a node component can be typed against the same
 * shape the parser produces.
 */
import type { CitationNode } from './plugins/remark-citation';
import type { AutoReferenceNode } from './plugins/remark-auto-references';
import type { HeadingAttributeBlock } from './syntax/heading_attributes';
import type { FigureNode } from './syntax/figures';
import type { TableCaptionNode } from './syntax/table_captions';
import type { WikilinkNode } from './plugins/remark-wikilink';
import type { DescriptionDetails, DescriptionList, DescriptionTerm } from './plugins/remark-deflist';

declare module 'mdast' {
  interface Heading {
    /** The exact trailing Pandoc attribute block, removed from rendered children. */
    headingAttributes?: HeadingAttributeBlock;
  }

  interface RootContentMap {
    autoReference: AutoReferenceNode;
    citation: CitationNode;
    figure: FigureNode;
    descriptionlist: DescriptionList;
    descriptionterm: DescriptionTerm;
    descriptiondetails: DescriptionDetails;
    wikilink: WikilinkNode;
  }

  interface Table {
    /** The exact source of a parsed table, when it belongs to a caption pair. */
    source?: string;
    /** The caption attached to this table. */
    tableCaption?: TableCaptionNode;
  }

  interface PhrasingContentMap {
    autoReference: AutoReferenceNode;
    citation: CitationNode;
    wikilink: WikilinkNode;
  }
}
