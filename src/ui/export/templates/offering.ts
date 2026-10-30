/**
 * Which template packages an export card may offer.
 *
 * May import: the template summary shape. Upholds: a readable package belongs to exactly one export
 * kind, while an unreadable manifest remains offerable so the reader can select and remove it.
 */

import type { TemplateSummary } from '../../../api/templates';

export function offeredForKind(summary: TemplateSummary, kind: string): boolean {
  return summary.manifest === null || summary.manifest.kind === kind;
}

export function offeredPackages(
  packages: TemplateSummary[],
  kind: string
): TemplateSummary[] {
  return packages.filter((summary) => offeredForKind(summary, kind));
}
