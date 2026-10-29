/**
 * Choosing the kind of a fenced-Div callout.
 *
 * Typing `:::` creates a closed, editable Div and opens this card beside the
 * caret. The five GitHub kinds and the custom Definition kind are the six
 * choices; choosing one is a single source edit owned by the editor.
 *
 * May import: the beside-card surface. Upholds: the picker holds no document
 * state and every choice is expressed by its stable callout kind name.
 */

import { BesideCard } from '../../floating/beside';
import type { Box } from '../../floating/placement';

/** What an installed editor does when a kind is chosen. */
export type CalloutKindPicker = (
  anchor: Box | null,
  current: string,
  choose: (kind: string) => void
) => void;

const CALLBACK_KIND = 'data-callout-kind-choice';
const KINDS = ['note', 'tip', 'important', 'warning', 'caution', 'definition'] as const;

let installed: CalloutKindPicker | null = null;
let changed: ((lineStart: number, kind: string) => void) | null = null;

/** Registers the editor's kind picker. */
export function setCalloutKindPicker(picker: CalloutKindPicker | null): void {
  installed = picker;
}

/** Registers the one source edit a choice makes. */
export function setCalloutKindChangeHandler(
  handler: ((lineStart: number, kind: string) => void) | null
): void {
  changed = handler;
}

/** Opens the kinds beside the picker's measured anchor. */
export function chooseCalloutKind(
  anchor: Box | null,
  current: string,
  lineStart: number
): void {
  installed?.(anchor, current, (kind) => changed?.(lineStart, kind));
}

/** Creates the editor's one reusable callout-kind card. */
export function installCalloutKindPicker(): CalloutKindPicker {
  let anchor: Box | null = null;
  let choose: ((kind: string) => void) | null = null;
  const card = new BesideCard({
    anchor: () => anchor,
    className: 'w-44 p-1'
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
    const row = (event.target as Element | null)?.closest<HTMLElement>(`[${CALLBACK_KIND}]`);
    const kind = row?.getAttribute(CALLBACK_KIND);
    if (kind === null || kind === undefined || choose === null) {
      return;
    }
    const answer = choose;
    close();
    answer(kind);
  });
  card.element.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!card.isOpen()) {
        return;
      }
      const target = event.target as Element | null;
      if (
        target !== null &&
        (card.element.contains(target) || target.closest('[data-chrome]') !== null)
      ) {
        return;
      }
      close();
    },
    true
  );

  return (source, current, answer) => {
    anchor = source;
    choose = answer;
    list.replaceChildren(...kindRows(current));
    card.open();
  };
}

function kindRows(current: string): HTMLElement[] {
  return KINDS.map((kind) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.setAttribute(CALLBACK_KIND, kind);
    row.className = 'rounded px-2 py-1 text-left text-sm hover:bg-base-300';
    if (kind === current) {
      row.classList.add('bg-base-300');
    }
    row.textContent = kind === 'definition'
      ? 'Definition'
      : `${kind[0].toUpperCase()}${kind.slice(1)}`;
    return row;
  });
}
