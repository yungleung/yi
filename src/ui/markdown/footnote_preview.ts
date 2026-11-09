/**
 * The card a footnote marker shows while the pointer rests on it.
 *
 * The text it shows is the *document's*: `syntax/footnote/` says where a label's
 * definition body starts, the block there is parsed the way any block is, and its
 * body is rendered with the components the notes run uses (`nodes/footnote.ts:
 * renderFootnoteBody`) — a second *place* to read a note, never a second renderer of
 * one. The rendered notes run itself cannot be copied: blocks are virtualised, so the
 * definition is usually not in the DOM at all. The card is the note's own words: the
 * label it is filed under is the marker the pointer is already on (`nodes/footnote.ts`
 * draws the notes run's label, and only there).
 *
 * The card takes the pointer, so a note can be read, selected, and linked out of — and it hides on
 * everything that moves: leaving the marker, scrolling, a click, `Escape`.
 *
 * May import: the editing context (the state and the scroll container), the footnotes
 * rule, the block factory, the node contract and `source_mode/` (the frame a node
 * needs to know which block it is being built in). Upholds: showing a note changes
 * nothing — no edit, no caret, no state.
 */

import { BesideCard, boxOf } from '../floating';
import { isOpenableUrl } from './syntax/link_edits';
import { footnoteOffsets } from './syntax/footnote';
import { renderFootnoteBody } from './nodes/footnote';
import { withRenderFrame } from './source_mode';
import type { AstFootnoteDefinition } from './ast';
import type { MarkdownBlock } from './document/block';
import type { EditorContext } from './editing/context';
import { openExternalUrl } from './link_opens';

/** How long the pointer has to rest on a marker before the card appears. */
const DWELL_MS = 200;

/**
 * How long the card waits before leaving, once the pointer is on neither it nor its
 * marker: the pointer needs a moment to cross the few pixels between them.
 */
const HIDE_GRACE_MS = 250;

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
    .find(
      (child) =>
        child.type === 'footnoteDefinition' &&
        String(child.identifier ?? child.label ?? '') === label
    ) as AstFootnoteDefinition | undefined;
  return node ? { node, block } : null;
}

/** Watches an editor's content view for a pointer resting on a footnote marker. */
export function installFootnotePreview(context: EditorContext): void {
  let card: BesideCard | null = null;
  let marker: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let leaving: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const keep = () => {
    if (leaving !== null) {
      clearTimeout(leaving);
      leaving = null;
    }
  };

  const hide = () => {
    cancel();
    keep();
    marker = null;
    card?.destroy();
    card = null;
  };

  /** Leaves, unless the pointer comes back first (see `HIDE_GRACE_MS`). */
  const hideSoon = () => {
    keep();
    leaving = setTimeout(() => {
      leaving = null;
      hide();
    }, HIDE_GRACE_MS);
  };

  const show = (label: string) => {
    const definition = definitionFor(context, label);
    if (!definition || !marker) {
      return;
    }
    // The app's beside-card places it under the marker and keeps it inside the window; the card
    // itself takes the pointer, so a note can be read, selected, and linked out of.
    const shown = new BesideCard({
      anchor: () => (marker ? boxOf(marker) : null),
      // `rounded-md!` because the shared card is `rounded-lg`: a preview and the find bar are the
      // app's two reading surfaces, and the probe holds them to the same corner.
      className: `${PREVIEW_CLASS} inline-block max-w-[34rem] rounded-md! p-2`
    });
    const element = shown.element;
    element.append(
      withRenderFrame(definition.block, () => renderFootnoteBody(definition.node))
    );
    element.addEventListener('mouseenter', keep);
    element.addEventListener('mouseleave', hideSoon);
    // Captured, because a link inside the card carries the editor's own click
    // handler (`nodes/link.ts`) which stops its propagation: this has to have the
    // first word, or the editor would try to open a source view in a block that may
    // not even be mounted.
    element.addEventListener(
      'click',
      (event) => {
        const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
        if (!anchor) {
          keep();
          return;
        }
        // A note may link out; opening it is the app's job, and the webview must never
        // navigate to it.
        event.preventDefault();
        event.stopPropagation();
        const href = anchor.getAttribute('href') ?? '';
        if (isOpenableUrl(href)) {
          openExternalUrl(href);
        }
      },
      true
    );
    shown.open();
    card = shown;
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
    // The marker and its card are one region: moving between them is not leaving.
    const to = event.relatedTarget as Node | null;
    if (to && (marker.contains(to) || card?.element.contains(to))) {
      keep();
      return;
    }
    hideSoon();
  });

  // Everything that moves the page or the text takes the card with it.
  context.contentView.addEventListener('scroll', hide, { passive: true });
  context.contentView.addEventListener('click', hide, true);
  // A click inside the card must not be read as the page moving on: the card's own
  // handler above keeps it, and only clicks in the text take it away.
  context.contentView.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  });
}
