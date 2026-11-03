/**
 * The card a rendered citation shows while the pointer rests on it: what the keys it names are,
 * as the reference entries the bibliography lists them under.
 *
 * It is the answer to "what is this key", so it shows the *reference* — title, venue, year — and
 * not the in-text form, which the sentence already holds. The text is the app's one bibliography
 * (`services/bibliography/index.ts: reference`), formatted in the CSL style and read from the file the
 * settings name: nothing is formatted here. What the card is built from is the citation's own
 * source, which the rendering carries (`nodes/citation.ts` sets `data-citation`) because the
 * formatted span no longer holds the keys; a source view carries no such tag, so the citation
 * being edited is one no card can appear on.
 *
 * The card takes the pointer, so a reference can be read, selected and copied — and it hides on
 * everything that moves: leaving the citation, scrolling, a click, `Escape`.
 *
 * May import: the floating card, the bibliography service and the editing context. Upholds:
 * showing a reference changes nothing — no edit, no caret, no state.
 */

import { BesideCard, boxOf } from '../floating';
import type { EditorContext } from './editing/context';

/** How long the pointer has to rest on a citation before the card appears. */
const DWELL_MS = 200;

/**
 * How long the card waits before leaving, once the pointer is on neither it nor its
 * citation: the pointer needs a moment to cross the few pixels between them.
 */
const HIDE_GRACE_MS = 250;

/** The card's class, which the probe finds it by. */
export const PREVIEW_CLASS = 'markdown-citation-preview';

/** Watches an editor's content view for a pointer resting on a rendered citation. */
export function installCitationPreview(context: EditorContext): void {
  let card: BesideCard | null = null;
  let citation: HTMLElement | null = null;
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
    citation = null;
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

  const show = (value: string) => {
    const entries = context.host.citations.references(value);
    if (entries.length === 0 || !citation) {
      return;
    }
    const shown = new BesideCard({
      anchor: () => (citation ? boxOf(citation) : null),
      // `rounded-md!` because the shared card is `rounded-lg`: a preview and the find bar are the
      // app's two reading surfaces, and the probe holds them to the same corner. `select-text!`
      // because the card is `select-none` like every surface, and a reference is there to be
      // copied out.
      className: `${PREVIEW_CLASS} flex flex-col gap-2 max-w-[34rem] rounded-md! p-2 select-text!`
    });
    const element = shown.element;
    for (const entry of entries) {
      const paragraph = document.createElement('p');
      paragraph.textContent = entry;
      element.appendChild(paragraph);
    }
    element.addEventListener('mouseenter', keep);
    element.addEventListener('mouseleave', hideSoon);
    // A press inside the card is a selection, not the page moving on.
    element.addEventListener('click', keep);
    shown.open();
    card = shown;
  };

  context.contentView.addEventListener('mouseover', (event) => {
    const target = event.target as Element | null;
    const found = target?.closest<HTMLElement>('[data-citation]') ?? null;
    if (!found || found === citation) {
      return;
    }
    const value = found.dataset.citation;
    if (!value) {
      return;
    }
    hide();
    citation = found;
    // Decided before the dwell, so a citation the bibliography cannot answer — every key missing
    // from the library — never shows a card at all, not even an empty one.
    if (context.host.citations.references(value).length === 0) {
      citation = null;
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      show(value);
    }, DWELL_MS);
  });

  context.contentView.addEventListener('mouseout', (event) => {
    if (!citation) {
      return;
    }
    // The citation and its card are one region: moving between them is not leaving.
    const to = event.relatedTarget as Node | null;
    if (to && (citation.contains(to) || card?.element.contains(to))) {
      keep();
      return;
    }
    hideSoon();
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
