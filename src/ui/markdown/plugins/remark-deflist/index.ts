/**
 * Node types produced by the external `remark-deflist` plugin, which ships no
 * official type declarations. They are declared here so the editor's other
 * modules (and mdast's type registry) can reference them like the node types
 * of the plugins we maintain ourselves.
 */
import type { RootContent } from 'mdast';

/** remark-deflist `<dl>` node. */
export interface DescriptionList {
  type: 'descriptionlist';
  children: RootContent[];
}

/** remark-deflist `<dt>` node. */
export interface DescriptionTerm {
  type: 'descriptionterm';
  children: RootContent[];
}

/** remark-deflist `<dd>` node. */
export interface DescriptionDetails {
  type: 'descriptiondetails';
  children: RootContent[];
}
