/**
 * Choosing a fenced code block's language: the list its label opens.
 *
 * The label is a button (`nodes/fence_label.ts`), and what pressing it asks for is a card beside it
 * holding every language highlight.js ships — plus `text`, which names none. A code fence in an
 * unrendered Pandoc Div has no label element, so the same picker also accepts the caret's measured
 * box. It is the whole list on purpose: auto-detection is the fallback for a fence that names no
 * language, and a short curated list would be a second opinion about what a note may be written in.
 *
 * The card never takes the keyboard: the reader clicks a language, or presses Escape, or presses
 * anywhere else, and the card goes. The choice itself is not made here — this module is a surface,
 * and the editor owns the edit (`markdown_editor.ts`, over the pure rule in
 * `syntax/fence_edits.ts: fenceLanguageEdit`).
 *
 * May import: highlight.js and the card kind (`ui/floating/beside.ts`). Upholds: the picker holds no
 * document state — it is told which block's language is current and hands back what was pressed.
 */

import hljs from 'highlight.js';
import { BesideCard, boxOf } from '../../floating/beside';
import type { Box } from '../../floating/placement';

/** How the editor answers a label: open the list beside `anchor`, reporting what is pressed. */
export type LanguagePicker = (
  anchor: Box | null,
  current: string,
  choose: (language: string) => void
) => void;

/** What the labels ask, or null before an editor has installed its picker. */
let installed: LanguagePicker | null = null;

/** What an editor does with a chosen language, or null before one has installed a handler. */
let changed: ((lineStart: number, language: string) => void) | null = null;

/** Registers the editor's picker, which the labels reach through {@link chooseLanguage}. */
export function setLanguagePicker(picker: LanguagePicker | null): void {
  installed = picker;
}

/** Registers the one edit a choice makes. The block is named by the line it starts at. */
export function setLanguageChangeHandler(
  handler: ((lineStart: number, language: string) => void) | null
): void {
  changed = handler;
}

/** The label was pressed: the list opens for this block, and whatever is picked is applied to it. */
export function chooseLanguage(anchor: HTMLElement, current: string, lineStart: number): void {
  chooseLanguageAt(boxOf(anchor), current, lineStart);
}

/** Opens the list beside a measured caret, for a fence whose block has no label element. */
export function chooseLanguageAt(anchor: Box | null, current: string, lineStart: number): void {
  installed?.(anchor, current, (language) => changed?.(lineStart, language));
}

/**
 * Makes the picker for one editor. It is created once and reused: the card is the app's own chrome,
 * and one per press would leave the rest behind.
 */
export function installLanguagePicker(): LanguagePicker {
  let anchor: Box | null = null;
  let choose: ((language: string) => void) | null = null;
  const card = new BesideCard({
    anchor: () => anchor,
    className: 'max-h-80 w-56 overflow-y-auto p-1'
  });
  const list = document.createElement('div');
  list.className = 'flex flex-col';
  card.element.appendChild(list);

  const close = (): void => {
    anchor = null;
    choose = null;
    card.close();
  };

  card.element.addEventListener('click', (event) => {
    const row = (event.target as Element | null)?.closest<HTMLElement>('[data-language]');
    const picked = row?.dataset.language;
    if (picked === undefined || choose === null) {
      return;
    }
    const answer = choose;
    close();
    answer(picked);
  });

  // A press on the list is a press on the app's own chrome, like the titlebar's buttons: it must not
  // read as a click outside the document, which is what takes the caret away (`caret/caret.ts`). The
  // reader is naming the language of the block they are writing in, so the caret has to still be
  // there — in the body below the fence — when the choice lands.
  card.element.addEventListener('click', (event) => event.stopPropagation());

  // A press anywhere else is the reader's: the list goes, and nothing is chosen. A press on a
  // *label* is that label's own click, which opens the list again for the block it belongs to.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!card.isOpen()) {
        return;
      }
      const target = event.target as Element | null;
      if (target !== null && (card.element.contains(target) || target.closest('[data-chrome]') !== null)) {
        return;
      }
      close();
    },
    true
  );

  return (label, current, answer) => {
    anchor = label;
    choose = answer;
    list.replaceChildren(...languageRows(current));
    card.open();
  };
}

/** The rows: `text` for a fence that names no language, then every language, alphabetically. */
function languageRows(current: string): HTMLElement[] {
  return ['', ...hljs.listLanguages().sort()].map((language) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.dataset.language = language;
    row.className = 'rounded px-2 py-1 text-left text-sm hover:bg-base-300';
    if (language === current) {
      row.classList.add('bg-base-300');
    }
    row.textContent = language === '' ? 'text' : language;
    return row;
  });
}
