/**
 * Renders a block's complete source while the caret is inside it.
 *
 * Example: a callout becomes `CalloutSourceView`, a quote becomes `QuoteSourceView`, and a code
 * fence becomes an editable `FenceText` containing its delimiters.
 *
 * May import: source node views and fence source metadata. Upholds: source mode always exposes the
 * document's exact characters and never a normalized node rendering.
 */

import type { BlockNode } from '../document/blocks';
import { CalloutSourceView } from '../nodes/callout_source';
import { FenceText } from '../nodes/fence_text';
import { FencedDivSourceView } from '../nodes/fenced_div_source';
import { QuoteSourceView } from '../nodes/quote_source';
import type { CalloutSource } from '../syntax/callout';
import {
  SOURCE_CLASS,
  fenceCorner,
  fenceKind,
  markListing
} from './fence';

export function renderSourceBlock(
  node: BlockNode,
  callout: CalloutSource | null,
  container: (node: BlockNode) => HTMLElement
): HTMLElement {
  const kind = fenceKind(node);
  const element = container(node);
  if (callout !== null) {
    element.classList.add('markdown-callout-block');
    element.appendChild(new CalloutSourceView(node).element);
    return element;
  }
  if (node.kind === 'fencedDiv') {
    element.appendChild(new FencedDivSourceView(node).element);
    return element;
  }
  if (node.kind === 'quote') {
    element.appendChild(new QuoteSourceView(node).element);
    return element;
  }
  markListing(element, node);
  element.appendChild(
    new FenceText(
      node,
      { ...kind, className: `${SOURCE_CLASS} ${kind.className}` },
      true
    ).element
  );
  element.appendChild(fenceCorner(kind, node));
  return element;
}
