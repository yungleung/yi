/**
 * The card a footnote marker shows while the pointer rests on it.
 *
 * The text it shows is the *document's*: `syntax/footnotes.ts` says where a label's
 * definition body starts, the block there is parsed the way any block is, and its
 * body is rendered with the components the notes run uses (`nodes/footnote.ts:
 * renderFootnoteBody`) — a second *place* to read a note, never a second renderer of
 * one. The rendered notes run itself cannot be copied: blocks are virtualised, so the
 * definition is usually not in the DOM at all.
 *
 * The card is deliberately dumb: `pointer-events: none`, so it can never take a click
 * or a hover from the text under it, and it hides on everything that moves — leaving
 * the marker, scrolling, a click, `Escape`.
 *
 * May import: the editing context (the state and the scroll container), the footnotes
 * rule, the block factory, the node contract and `source_mode.ts` (the frame a node
 * needs to know which block it is being built in). Upholds: showing a note changes
 * nothing — no edit, no caret, no state.
 */

import { footnoteOffsets } from './syntax/footnotes';
import { renderFootnoteBody } from './nodes/footnote';
import { withRenderFrame } from './source_mode';
import type { AstFootnoteDefinition } from './ast';
import type { MarkdownBlock } from './document/blocks';
import type { EditorContext } from './editing/context';

/** How long the pointer has to rest on a marker before the card appears. */
const DWELL_MS = 200;

/** The card's class, which the probe finds it by. */
export const PREVIEW_CLASS = 'markdown-footnote-preview';

/**
 * The definition a label names, as the node to render and the block it sits in, or
 * null when the document does not define it.
 */
function definitionFor(
  context: EditorContext,
  label: string
): { node: AstFootnoteDefinition; block: MarkdownBlock } | null {
  const body = footnoteOffsets(context.state.getText(), label).definitionBody;
  if (body === null) {
    return null;
  }
  const block = context.state.getBlockAtOffset(body);
  if (!block) {
    return null;
  }
  const node = context.state
    .getBlockContent(block)
    .find((child) => child.type === 'footnoteDefinition') as AstFootnoteDefinition | undefined;
  return node ? { node, block } : null;
}

/** Watches an editor's content view for a pointer resting on a footnote marker. */
export function installFootnotePreview(context: EditorContext): void {
  let card: HTMLElement | null = null;
  let marker: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const hide = () => {
    cancel();
    marker = null;
    card?.remove();
    card = null;
  };

  const show = (label: string) => {
    const definition = definitionFor(context, label);
    if (!definition || !marker) {
      return;
    }
    const element = document.createElement('div');
    element.className = `${PREVIEW_CLASS} card bg-base-200 border border-base-300 shadow-lg`;
    element.style.position = 'fixed';
    element.style.zIndex = '50';
    element.style.maxWidth = '34rem';
    element.style.padding = '0.6rem 0.8rem';
    element.style.pointerEvents = 'none';
    element.append(
      withRenderFrame(definition.block, () => renderFootnoteBody(definition.node))
    );
    // The card lives on the page rather than inside the scroller: `fixed` inside a
    // scroll container is only fixed while no ancestor transforms anything.
    document.body.appendChild(element);
    place(element, marker);
    card = element;
  };

  context.contentView.addEventListener('mouseover', (event) => {
    const target = event.target as Element | null;
    const found = target?.closest<HTMLElement>('[data-footnote-ref]') ?? null;
    if (!found || found === marker) {
      return;
    }
    // A marker that is showing its own source is the author editing the label: a card
    // in the way would be noise.
    if (found.classList.contains('markdown-footnote-source')) {
      return;
    }
    const label = found.dataset.footnoteRef;
    if (!label) {
      return;
    }
    hide();
    marker = found;
    // Defined before the dwell, so a label the document does not define never shows a
    // card at all — not even an empty one.
    if (!definitionFor(context, label)) {
      marker = null;
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      show(label);
    }, DWELL_MS);
  });

  context.contentView.addEventListener('mouseout', (event) => {
    if (!marker) {
      return;
    }
    const to = event.relatedTarget as Node | null;
    if (to && marker.contains(to)) {
      return;
    }
    hide();
  });

  // Everything that moves the page or the text takes the card with it.
  context.contentView.addEventListener('scroll', hide, { passive: true });
  context.contentView.addEventListener('click', hide, true);
  context.contentView.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  });
}

/** Puts the card under its marker, kept inside the window. */
function place(card: HTMLElement, marker: HTMLElement): void {
  const markerBox = marker.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const left = Math.max(8, Math.min(markerBox.left, window.innerWidth - box.width - 8));
  const below = markerBox.bottom + 6;
  const top =
    below + box.height <= window.innerHeight - 8 ? below : Math.max(8, markerBox.top - box.height - 6);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}
