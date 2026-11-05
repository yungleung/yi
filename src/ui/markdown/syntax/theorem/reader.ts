/**
 * Classifies one complete fenced Div as a declared theorem.
 *
 * Example: `::: {#thm:one .Theorem info="First"}` returns the Theorem type,
 * `thm:one`, `First`, and the exact source/body ranges; an undeclared class
 * returns null and remains ordinary Div source.
 *
 * May import: the shared Div and Pandoc attribute readers and the theorem
 * vocabulary. Upholds: only one declared class is accepted and the theorem ID
 * must be able to use pandoc-amsthm's named reference form.
 */

import {
  readAttributedDivOpening,
  readFencedDiv,
  type AttributedFencedDivOpening
} from '../container';
import type { TheoremType, TheoremVocabulary } from './model';

/** One theorem's exact source and editable ranges. */
export interface TheoremSource {
  type: TheoremType;
  id: string | null;
  info: string;
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  bodyFrom: number;
  bodyTo: number;
  source: string;
}

/** Read one complete theorem from the start of `source`. */
export function readTheorem(
  source: string,
  vocabulary: TheoremVocabulary
): TheoremSource | null {
  const lines = source.split('\n');
  const opening = lines[0] === undefined
    ? null
    : readAttributedDivOpening(lines[0]);
  if (opening === null) {
    return null;
  }
  const div = readFencedDiv(source);
  return div === null
    ? null
    : theoremFromOpening(opening, div, source, vocabulary);
}

/** Build a theorem from the generic opening and complete-div ranges. */
export function theoremFromOpening(
  opening: AttributedFencedDivOpening,
  div: {
    from: number;
    to: number;
    markerFrom: number;
    markerTo: number;
    bodyFrom: number;
    bodyTo: number;
  },
  source: string,
  vocabulary: TheoremVocabulary
): TheoremSource | null {
  const classes = [...new Set(opening.attribute.classes)];
  const types = classes
    .map((name) => vocabulary.byClass.get(name))
    .filter((type): type is TheoremType => type !== undefined);
  const id = opening.attribute.id;
  if (types.length !== 1 || (id !== null && !/^[a-z]/.test(id))) {
    return null;
  }
  return {
    type: types[0],
    id,
    info: opening.attribute.attributes.info ?? '',
    from: div.from,
    to: div.to,
    markerFrom: div.markerFrom,
    markerTo: div.markerTo,
    bodyFrom: div.bodyFrom,
    bodyTo: div.bodyTo,
    source
  };
}
