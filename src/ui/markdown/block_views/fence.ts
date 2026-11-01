/**
 * Renders fenced bodies, labels and listing captions.
 *
 * Example: a code fence without an ID shows a highlighted body and language corner; adding
 * `{#lst:one caption="Example"}` wraps the same body in a listing figure with its generated label.
 *
 * May import: block/model nodes, fence syntax and the language picker. Upholds: fence kind facts
 * have one home, and listing attributes remain export metadata except the target ID.
 */

import type { BlockNode } from '../document/block';
import { chooseLanguage } from '../editing/language_picker';
import { codeFenceData, listingFenceData, type CodeFenceData } from '../syntax/code';
import { FenceText, fenceLabel, type FenceTextStyle } from '../nodes/fence';
import { highlightCode } from '../nodes/code';
import { highlightFrontmatter } from '../nodes/frontmatter_highlight';
import { highlightLatex } from '../nodes/latex_highlight';
import { renderContext } from '../render_context';

/** The class that marks a block as showing its own source rather than its view. */
export const SOURCE_CLASS = 'markdown-source-text';

/** The class every source box and body box carries: a long line scrolls rather than wraps. */
export const OVERFLOW_CLASS = 'overflow-x-auto';

/** What a fenced block is: how its characters are drawn, and what its corner says. */
export interface FenceKind extends FenceTextStyle {
  readonly label: string;
  readonly choosesLanguage: boolean;
}

/** Read one of the three fenced kinds off its block. */
export function fenceKind(node: BlockNode): FenceKind {
  if (node.kind === 'frontmatter') {
    return {
      className: 'markdown-frontmatter',
      language: 'yaml',
      highlight: (source) => highlightFrontmatter(source),
      label: 'YAML Frontmatter',
      choosesLanguage: false
    };
  }
  if (node.kind === 'fencedCode') {
    const language = codeFenceData(node.text).language ?? '';
    return {
      className: 'markdown-fenced-code',
      language,
      highlight: (source) => highlightCode(source, language),
      label: language === '' ? 'text' : language,
      choosesLanguage: true
    };
  }
  return {
    className: 'markdown-display-math',
    language: 'latex',
    highlight: highlightLatex,
    label: 'latex',
    choosesLanguage: false
  };
}

/** Apply only a listing's target ID; other attributes remain export metadata. */
export function markListing(element: HTMLElement, node: BlockNode): void {
  if (node.kind !== 'fencedCode') {
    return;
  }
  const listing = listingFenceData(node.text);
  if (listing === null) {
    return;
  }
  element.classList.add('markdown-listing-block');
  if (listing.id !== null) {
    element.id = listing.id;
  }
}

/** The generated number and caption text read from the opening fence. */
export function listingCaption(
  node: BlockNode,
  listing: CodeFenceData
): HTMLElement | null {
  const number = renderContext().listingLabelAt(node.charStart);
  if (number === null && listing.caption === null) {
    return null;
  }
  const caption = document.createElement('figcaption');
  caption.className = 'markdown-listing-caption';
  if (number !== null) {
    const label = document.createElement('span');
    label.className = 'markdown-listing-label';
    label.textContent = `${number}.`;
    caption.appendChild(label);
    if (listing.caption !== null) {
      caption.appendChild(document.createTextNode(' '));
    }
  }
  if (listing.caption !== null) {
    caption.appendChild(document.createTextNode(listing.caption));
  }
  return caption;
}

/** A fence's corner label, with the code language as a button when it may be changed. */
export function fenceCorner(kind: FenceKind, node: BlockNode): HTMLElement {
  return kind.choosesLanguage
    ? fenceLabel({
        text: kind.label,
        onChoose: (label) => chooseLanguage(label, kind.language, node.lineStart)
      })
    : fenceLabel({ text: kind.label });
}

/** A fenced block's body with delimiters hidden, including its listing figure when qualified. */
export function renderFenceBody(
  node: BlockNode,
  container: (node: BlockNode) => HTMLElement
): HTMLElement {
  const kind = fenceKind(node);
  const element = container(node);
  const listing = node.kind === 'fencedCode' ? listingFenceData(node.text) : null;
  const body = new FenceText(
    node,
    { ...kind, className: `${kind.className} ${OVERFLOW_CLASS}` }
  ).element;
  if (listing === null) {
    element.appendChild(body);
  } else {
    markListing(element, node);
    const figure = document.createElement('figure');
    figure.className = 'markdown-listing';
    figure.appendChild(body);
    const caption = listingCaption(node, listing);
    if (caption !== null) {
      figure.appendChild(caption);
    }
    element.appendChild(figure);
  }
  element.appendChild(fenceCorner(kind, node));
  return element;
}
