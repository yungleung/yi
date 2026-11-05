/**
 * The grouped Div-kind picker for callouts and theorem types.
 *
 * Example: the callout Definition and theorem Definition are separate rows with
 * distinct `callout:` and `theorem:` values even though both display `Definition`.
 *
 * May import: the choice-card surface, callout kind names and theorem vocabulary.
 * Upholds: this surface chooses a stable value; the editor owns the source edit.
 */

import type { Box } from '../../floating';
import { ChoiceCard, type Choice } from '../choice_card';
import type { TheoremVocabulary } from '../syntax/theorem';

export type DivKindPicker = (
  anchor: Box | null,
  current: string,
  choices: readonly Choice[],
  choose: (value: string) => void
) => void;

const CALLBACK = 'data-div-kind-choice';
const CALLOUTS = ['note', 'tip', 'important', 'warning', 'caution', 'definition'] as const;

let installed: DivKindPicker | null = null;
let changed: ((lineStart: number, value: string) => void) | null = null;

export function setDivKindPicker(picker: DivKindPicker | null): void {
  installed = picker;
}

export function setDivKindChangeHandler(
  handler: ((lineStart: number, value: string) => void) | null
): void {
  changed = handler;
}

export function chooseDivKind(
  anchor: Box | null,
  current: string,
  lineStart: number,
  vocabulary: TheoremVocabulary
): void {
  installed?.(anchor, current, divKindChoices(vocabulary), (value) =>
    changed?.(lineStart, value)
  );
}

export function installDivKindPicker(): DivKindPicker {
  const card = new ChoiceCard(CALLBACK, 'max-h-80 w-56 overflow-y-auto p-1');
  return (source, current, choices, answer) =>
    card.open(source, current, choices, answer);
}

/** The one choice list shared by insertion and future kind changes. */
export function divKindChoices(vocabulary: TheoremVocabulary): Choice[] {
  return [
    { value: 'default', label: 'Default' },
    ...CALLOUTS.map((kind) => ({
      value: `callout:${kind}`,
      label: kind[0].toUpperCase() + kind.slice(1),
      group: 'Callout'
    })),
    ...vocabulary.types.map((type) => ({
      value: `theorem:${type.className}`,
      label: type.displayName,
      group: 'Theorem'
    }))
  ];
}
