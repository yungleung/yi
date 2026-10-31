/**
 * Choosing a fenced code block's language: the list its label opens.
 *
 * The label is a button (`nodes/fence_label.ts`), and what pressing it asks for is a card beside it
 * holding every language highlight.js ships — plus `text`, which names none. A code fence in an
 * unrendered Pandoc Div has no label element, so the same picker also accepts the caret's measured
 * box. It is the whole list on purpose: auto-detection is the fallback for a fence that names no
 * language, and a short curated list would be a second opinion about what a note may be written in.
 *
 * The card never takes focus: the reader chooses a language with the pointer or
 * arrows and Enter, types into the opening fence to filter, presses Escape, or
 * presses anywhere else. A newly opened fence keeps its caret after the opening
 * backticks for this purpose; a space closes filtering but remains source so
 * Pandoc attributes can follow. The choice itself is not made here — this module
 * is a surface, and the editor owns the edit (`markdown_editor.ts`, over the pure rule in
 * `syntax/fence_edits.ts: fenceLanguageEdit`).
 *
 * May import: highlight.js, the beside measurement and the shared choice card.
 * Upholds: the picker holds no document state — it is told which block's
 * language is current and hands back what was chosen.
 */

import hljs from 'highlight.js';
import { boxOf } from '../../floating/beside';
import type { Box } from '../../floating/placement';
import { ChoiceCard } from '../choice_card';

/** How the editor answers a label: open the list beside `anchor`, reporting what is pressed. */
export type LanguagePicker = (
  anchor: Box | null,
  current: string,
  choose: (language: string) => void,
  typeToFilter?: boolean
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

/** Opens the list beside a measured caret, optionally filtering as source is typed. */
export function chooseLanguageAt(
  anchor: Box | null,
  current: string,
  lineStart: number,
  typeToFilter = false
): void {
  installed?.(
    anchor,
    current,
    (language) => changed?.(lineStart, language),
    typeToFilter
  );
}

/**
 * Makes the picker for one editor. It is created once and reused: the card is the app's own chrome,
 * and one per press would leave the rest behind.
 */
export function installLanguagePicker(): LanguagePicker {
  const card = new ChoiceCard(
    'data-language',
    'max-h-80 w-56 overflow-y-auto p-1'
  );

  return (label, current, answer, typeToFilter = false) => {
    card.open(label, current, languageChoices(), answer, { typeToFilter });
  };
}

/** `text` for a fence that names no language, then every language, alphabetically. */
function languageChoices(): Array<{ value: string; label: string }> {
  return ['', ...hljs.listLanguages().sort()].map((language) => ({
    value: language,
    label: language === '' ? 'text' : language
  }));
}
