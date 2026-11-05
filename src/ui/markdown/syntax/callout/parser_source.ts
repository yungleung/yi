/**
 * Turns callout fenced-Div openings into the directive spelling the remark
 * parser understands without changing source length.
 *
 * Example: `::: {.callout-tip}` becomes `::::callout-tip` plus spaces of the
 * same width, so every node offset still names the original document.
 *
 * May import: marker helpers, fenced-Div reading and callout source readers.
 * Upholds: frontmatter, code fences, display math and quote carriers are
 * skipped, and only a complete callout whose enclosing Divs also closed is
 * rewritten.
 */

import { closingFence, openingFence } from '../markers';
import {
  divDirectivesForParsers,
  readFencedDiv,
  type AttributedFencedDivOpening
} from '../container';
import {
  quoteLine,
  readCallout,
  sourceLines,
} from './reader';

/** The parser spelling of callout fenced Divs, with every source offset kept. */
export function calloutsForParsers(markdown: string): string {
  return divDirectivesForParsers(markdown, (opening) => {
    const kind = calloutKind(opening);
    return kind === null ? null : `callout-${kind}`;
  });
}

/** Whether this source contains a complete fenced Div that is not a known callout. */
export function hasGenericFencedDiv(source: string): boolean {
  let codeFence: string | null = null;
  let displayMath = false;
  for (const line of sourceLines(source)) {
    const content = quoteLine(line)?.content ?? line.text;
    if (codeFence !== null) {
      if (closingFence(content, codeFence)) {
        codeFence = null;
      }
      continue;
    }
    const fence = openingFence(content);
    if (fence !== null) {
      codeFence = fence;
      continue;
    }
    if (displayMath) {
      if (content.trimEnd().endsWith('$$')) {
        displayMath = false;
      }
      continue;
    }
    if (content.trimStart().startsWith('$$')) {
      const first = content.indexOf('$$');
      const closesOnLine =
        content.indexOf('$$', first + 2) >= 0 && content.trimEnd().endsWith('$$');
      displayMath = !closesOnLine;
      continue;
    }
    if (!line.text.includes(':::')) {
      continue;
    }
    const slice = source.slice(line.start);
    if (readFencedDiv(slice) !== null && readCallout(slice) === null) {
      return true;
    }
  }
  return false;
}

function calloutKind(opening: AttributedFencedDivOpening): string | null {
  const kinds = opening.attribute.classes
    .map((name) => /^callout-([a-z0-9][a-z0-9_-]*)$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1])
    .filter((kind) => kind !== 'title' && kind !== 'body');
  return kinds.length === 1 ? kinds[0] : null;
}
