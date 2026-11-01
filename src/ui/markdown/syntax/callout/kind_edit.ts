/**
 * Builds the minimal edit that changes a fenced Div between Default and a
 * callout kind.
 *
 * Example: `::: {.callout-note}` changed to `tip` edits only `callout-note`
 * to `callout-tip`; the fences, body, ID and unrelated attributes do not move.
 *
 * May import: fenced-Div ranges, Pandoc attributes, the shared edit value and
 * callout class grammar. Upholds: an invalid kind or a non-Div offset answers
 * null, and Default removes only callout metadata.
 */

import type { TextEdit } from '../edit_range';
import { fencedDivAtOffset } from '../container';
import { attributeBlockAtEnd } from '../pandoc';
import { CALLOUT_CLASS } from './model';

export function calloutKindEdit(text: string, kind: string, offset = 0): TextEdit | null {
  if (kind !== 'default' && !/^[a-z0-9][a-z0-9_-]*$/.test(kind)) {
    return null;
  }
  const div = fencedDivAtOffset(text, offset);
  if (div === null) {
    return null;
  }
  const lineStart = text.lastIndexOf('\n', Math.max(0, div.markerFrom - 1)) + 1;
  const lineEnd = text.indexOf('\n', lineStart);
  const end = lineEnd < 0 ? text.length : lineEnd;
  const line = text.slice(lineStart, end);
  const attribute = attributeBlockAtEnd(line, line.length, false);
  if (attribute === null) {
    return kind === 'default'
      ? null
      : {
          from: div.markerFrom + div.fenceLength,
          to: end,
          replacement: ` {.callout .callout-${kind}}`
        };
  }
  const token = calloutClassToken(attribute.source);
  if (kind === 'default') {
    const tokens = attributeTokens(attribute.source).filter(
      (entry) => entry.text !== '.callout' && !CALLOUT_CLASS.test(entry.text.slice(1))
    );
    return {
      from:
        lineStart +
        (tokens.length === 0
          ? div.markerFrom + div.fenceLength
          : attribute.from),
      to: lineStart + attribute.to,
      replacement:
        tokens.length === 0
          ? ''
          : `{${tokens.map((entry) => entry.text).join(' ')}}`
    };
  }
  if (token !== null) {
    return {
      from: lineStart + attribute.from + token.from,
      to: lineStart + attribute.from + token.to,
      replacement: `callout-${kind}`
    };
  }
  const tokens = attributeTokens(attribute.source);
  const additions = [
    ...(tokens.some((entry) => entry.text === '.callout') ? [] : ['.callout']),
    `.callout-${kind}`
  ];
  return {
    from: lineStart + attribute.from + 1,
    to: lineStart + attribute.from + 1,
    replacement: `${additions.join(' ')} `
  };
}

function attributeTokens(source: string): Array<{ from: number; to: number; text: string }> {
  const tokens: Array<{ from: number; to: number; text: string }> = [];
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let start = -1;
  for (let index = 1; index < source.length - 1; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    }
    if (/\s/.test(character)) {
      if (start >= 0) {
        tokens.push({ from: start, to: index, text: source.slice(start, index) });
        start = -1;
      }
    } else if (start < 0) {
      start = index;
    }
  }
  if (start >= 0) {
    tokens.push({
      from: start,
      to: source.length - 1,
      text: source.slice(start, source.length - 1)
    });
  }
  return tokens;
}

/** The class token after the dot, outside quoted attribute values. */
function calloutClassToken(source: string): { from: number; to: number } | null {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 1; index < source.length - 1; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== '.' || (index > 1 && !/\s/.test(source[index - 1]))) {
      continue;
    }
    let end = index + 1;
    while (end < source.length - 1 && !/\s/.test(source[end])) {
      end += 1;
    }
    const name = source.slice(index + 1, end);
    if (name.startsWith('callout-') && name !== 'callout-title' && name !== 'callout-body') {
      return { from: index + 1, to: end };
    }
  }
  return null;
}
