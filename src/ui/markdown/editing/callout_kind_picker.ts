/**
 * Choosing the kind of a fenced-Div callout.
 *
 * Typing `:::` creates a closed, editable Div and opens this card beside the
 * caret. Default adds no opening attributes; the five GitHub kinds and the
 * custom Definition kind add a callout class. Every choice is a single source
 * edit owned by the editor.
 *
 * May import: the shared choice card. Upholds: the picker holds no document
 * state and every choice is expressed by its stable Div-kind name.
 */

import type { Box } from '../../floating/placement';
import { ChoiceCard } from '../choice_card';

/** What an installed editor does when a kind is chosen. */
export type CalloutKindPicker = (
  anchor: Box | null,
  current: string,
  choose: (kind: string) => void
) => void;

const CALLBACK_KIND = 'data-callout-kind-choice';
const KINDS = [
  'default',
  'note',
  'tip',
  'important',
  'warning',
  'caution',
  'definition'
] as const;

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
  const card = new ChoiceCard(CALLBACK_KIND, 'w-44 p-1');

  return (source, current, answer) => {
    card.open(source, current, kindChoices(), answer);
  };
}

function kindChoices(): Array<{ value: string; label: string }> {
  return KINDS.map((kind) => ({
    value: kind,
    label:
      kind === 'default'
        ? 'Default'
        : kind === 'definition'
          ? 'Definition'
          : `${kind[0].toUpperCase()}${kind.slice(1)}`
  }));
}
