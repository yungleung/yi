/**
 * Ordered application of source-span rewrites.
 *
 * Example: rewrites at offsets 2 and 10 are applied from 10 to 2, so inserting a title at 2 never
 * shifts the span that still names offset 10.
 *
 * May import: the shared `Rewrite` contract. Upholds: spans refer to the original text and every
 * replacement is applied exactly once.
 */

import type { Rewrite } from './contracts';

export function applyRewrites(text: string, rewrites: readonly Rewrite[]): string {
  let rewritten = text;
  for (const rewrite of [...rewrites].sort((one, other) => other.start - one.start)) {
    rewritten =
      rewritten.slice(0, rewrite.start) + rewrite.text + rewritten.slice(rewrite.end);
  }
  return rewritten;
}
