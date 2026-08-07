/**
 * Registers the custom markdown node types used by the editor's plugins in
 * mdast's type registry, so they flow into `RootContent` (and phrasing
 * content where applicable).
 */
import type { CitationNode } from './plugins/remark-citation';
import type { WikilinkNode } from './plugins/remark-wikilink';
import type { DescriptionDetails, DescriptionList, DescriptionTerm } from './plugins/remark-deflist';

declare module 'mdast' {
  interface RootContentMap {
    citation: CitationNode;
    descriptionlist: DescriptionList;
    descriptionterm: DescriptionTerm;
    descriptiondetails: DescriptionDetails;
    wikilink: WikilinkNode;
  }

  interface PhrasingContentMap {
    citation: CitationNode;
    wikilink: WikilinkNode;
  }
}
