/**
 * Compatibility view of the shared reference index for headings.
 *
 * The generic index owns document order and Pandoc identifiers. Heading
 * rendering and navigation ask here only when they specifically need heading
 * targets.
 *
 * May import: the shared document reference index. Upholds: one home for
 * cross-reference targets — headings are filtered from that index rather than
 * parsed a second time.
 */

import {
  referenceIndex,
  type ReferenceEntry
} from './reference_index';

/** One heading a fragment can resolve to. */
export interface HeadingTarget {
  id: string;
  from: number;
  to: number;
  title: string;
  explicit: boolean;
}

/** Every heading target in document order. */
export function headingIndex(markdown: string): HeadingTarget[] {
  return referenceIndex(markdown)
    .filter((entry) => entry.kind === 'heading')
    .map(headingTarget);
}

/** The first heading with this ID, or null. */
export function firstHeadingTarget(
  targets: readonly HeadingTarget[],
  id: string
): HeadingTarget | null {
  return targets.find((target) => target.id === id) ?? null;
}

/** The public heading shape without generic-only fields. */
function headingTarget(entry: ReferenceEntry): HeadingTarget {
  return {
    id: entry.id!,
    from: entry.from,
    to: entry.to,
    title: entry.title,
    explicit: entry.explicit
  };
}
