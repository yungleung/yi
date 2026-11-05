/**
 * Builds the minimal edit that changes one fenced Div to a declared theorem
 * class or removes theorem metadata.
 *
 * Example: `{.Theorem #thm:one}` changed to `Lemma` edits only `Theorem`;
 * fences, ID and unrelated attributes stay where they are.
 *
 * May import: the complete-Div and Pandoc attribute readers plus the theorem
 * vocabulary. Upholds: an undeclared or malformed class produces no edit.
 */

import type { TextEdit } from '../edit_range';
import { fencedDivAtOffset } from '../container';
import { attributeBlockAtEnd } from '../pandoc';
import type { TheoremVocabulary } from './model';

/** Replace a theorem class, or remove theorem metadata for `default`. */
export function theoremKindEdit(
  text: string,
  className: string,
  vocabulary: TheoremVocabulary,
  offset = 0
): TextEdit | null {
  if (className !== 'default' && !vocabulary.byClass.has(className)) {
    return null;
  }
  const div = fencedDivAtOffset(text, offset);
  if (div === null) return null;
  const lineStart = text.lastIndexOf('\n', Math.max(0, div.markerFrom - 1)) + 1;
  const lineEnd = text.indexOf('\n', lineStart);
  const end = lineEnd < 0 ? text.length : lineEnd;
  const line = text.slice(lineStart, end);
  const attribute = attributeBlockAtEnd(line, line.length, false);
  if (attribute === null) {
    return className === 'default'
      ? null
      : {
          from: div.markerFrom + div.fenceLength,
          to: end,
          replacement: ` {.${className}}`
        };
  }
  const tokens = attributeTokens(attribute.source);
  const theoremTokens = tokens.filter((entry) =>
    entry.text.startsWith('.') &&
    vocabulary.byClass.has(entry.text.slice(1))
  );
  if (className === 'default') {
    if (theoremTokens.length === 0) return null;
    const kept = tokens.filter((entry) => !theoremTokens.includes(entry));
    return {
      from:
        lineStart +
        (kept.length === 0 ? div.markerFrom + div.fenceLength : attribute.from),
      to: lineStart + attribute.to,
      replacement:
        kept.length === 0
          ? ''
          : `{${kept.map((entry) => entry.text).join(' ')}}`
    };
  }
  if (theoremTokens.length > 0) {
    const first = theoremTokens[0];
    return {
      from: lineStart + attribute.from + first.from + 1,
      to: lineStart + attribute.from + first.to,
      replacement: className
    };
  }
  return {
    from: lineStart + attribute.from + 1,
    to: lineStart + attribute.from + 1,
    replacement: `.${className} `
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
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
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
