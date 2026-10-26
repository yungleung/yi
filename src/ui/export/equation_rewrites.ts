/**
 * Lowers display equations for every export kind.
 *
 * Ordinary KaTeX environments are made unnumbered. Every non-LaTeX display
 * equation receives one layout with a reserved number cell; a labeled wrapper
 * becomes one target with one Yi number, while LaTeX/PDF keeps native equation
 * lowering.
 *
 * May import: the equation grammar, block splitter, reference index, and
 * equation HTML renderer. Upholds: one labeled block is at most one target,
 * every non-LaTeX display equation shares one layout, and native row numbering
 * never survives a writer.
 */

import {
  equationBlockNumber,
  type ReferenceEntry
} from '../markdown/document/reference_index';
import { splitBlocks } from '../markdown/document/blocks';
import {
  innerEquationBody,
  latexEquationBody,
  readDisplayMath,
  readEquationBlock,
  type EquationBlockSource,
  unnumberedEquationBody
} from '../markdown/syntax/equation_blocks';
import {
  equationHtml,
  equationHtmlContainer,
  equationLayoutHtml
} from './equation_html';

/** One source range and its replacement. */
export interface EquationRewrite {
  start: number;
  end: number;
  text: string;
}

/** Every equation rewrite one export kind needs. */
export function equationRewrites(
  text: string,
  references: readonly ReferenceEntry[],
  kind: string
): EquationRewrite[] {
  const rewrites: EquationRewrite[] = [];
  const blocks = splitBlocks(text);
  const equationBlocks = blocks.filter((block) => block.kind === 'equation');
  for (const block of equationBlocks) {
    const equation = readEquationBlock(block.text);
    if (equation === null) {
      continue;
    }
    const entry = references.find(
      (candidate) => candidate.kind === 'equation' && candidate.from === block.charStart
    );
    if (kind === 'latex' || kind === 'pdf') {
      rewrites.push({
        start: block.charStart,
        end: block.charEnd,
        text: mathMarkdown(
          entry === undefined
            ? unnumberedEquationBody(equation.body)
            : latexEquationBody(equation.body, entry.id ?? '')
        )
      });
      continue;
    }
    const numberText = entry === undefined ? '' : equationBlockNumber(entry) ?? '';
    const math =
      entry === undefined
        ? unnumberedEquationBody(equation.body)
        : innerEquationBody(equation.body);
    rewrites.push({
      start: block.charStart,
      end: block.charEnd,
      text:
        kind === 'markdown'
          ? equationHtml(equation, math, numberText)
          : equationMarkdown(equation, math, numberText, kind)
    });
  }

  for (const block of blocks.filter((candidate) => candidate.kind === 'displayMath')) {
    const math = readDisplayMath(block.text);
    if (math === null) {
      continue;
    }
    const lowered = unnumberedEquationBody(math.body);
    if (kind === 'latex' || kind === 'pdf') {
      if (lowered === math.math) {
        continue;
      }
      rewrites.push({
        start: block.charStart + math.mathFrom,
        end: block.charStart + math.mathTo,
        text: lowered
      });
      continue;
    }
    rewrites.push({
      start: block.charStart,
      end: block.charEnd,
      text:
        kind === 'markdown'
          ? equationHtml(null, lowered, '')
          : equationMarkdown(null, lowered, '', kind)
    });
  }
  return rewrites;
}

/** One non-LaTeX display equation with an empty or numbered second cell. */
function equationMarkdown(
  equation: EquationBlockSource | null,
  math: string,
  numberText: string,
  kind: string
): string {
  if (kind === 'html' || kind === 'epub') {
    return equationHtmlContainer(
      equation,
      [
        equationLayoutHtml(
          mathMarkdown(math),
          equationNumberMarkdown(numberText)
        )
      ],
      ['equation-layout']
    );
  }

  const tokens = [
    ...(equation?.id == null ? [] : [`#${equation.id}`, '.equation-target']),
    '.equation-layout',
    ...(equation?.classes ?? []).map((name) => `.${name}`),
    ...Object.entries(equation?.attributes ?? {}).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
  return [
    `::: {${tokens.join(' ')}}`,
    equationGridTable(math, numberText),
    ':::'
  ].join('\n');
}

/** A native one-row table for writers that do not preserve layout HTML. */
function equationGridTable(math: string, numberText: string): string {
  const formula = math.trim() === '' ? '' : `$$${singleLineMath(math)}$$`;
  const number = equationNumberMarkdown(numberText);
  // Pandoc derives DOCX/ODT table width from the grid's column proportions. A grid spanning its
  // default 78-column text measure makes those proportions sum to one, so the writer emits a table
  // at the full page-content width instead of shrinking it to the formula's visible text.
  const formulaWidth = Math.max(78, formula.length + 2);
  const numberWidth = Math.max(10, Math.ceil(formulaWidth * 0.18), number.length + 2);
  const border = `+${'-'.repeat(formulaWidth + 2)}+${'-'.repeat(numberWidth + 2)}+`;
  return [
    border,
    `| ${padCell(formula, formulaWidth)} | ${padCell(number, numberWidth)} |`,
    border,
    ': {width=100%}'
  ].join('\n');
}

/** One display formula on one line, retaining TeX comment semantics. */
function singleLineMath(math: string): string {
  const lines = math.split(/\r?\n/);
  let result = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const comment = texCommentAt(line);
    result += comment < 0 ? line : line.slice(0, comment);
    if (comment < 0 && index < lines.length - 1) {
      result += ' ';
    }
  }
  return result;
}

/** The start of an unescaped TeX comment, or -1. */
function texCommentAt(line: string): number {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '%') {
      continue;
    }
    let escapes = 0;
    for (let before = index - 1; before >= 0 && line[before] === '\\'; before -= 1) {
      escapes += 1;
    }
    if (escapes % 2 === 0) {
      return index;
    }
  }
  return -1;
}

/** One literal number inside a Markdown table cell. */
function equationNumberMarkdown(numberText: string): string {
  return numberText.replace(/\\/g, '\\\\').replace(/[()|]/g, '\\$&');
}

/** Pad one grid-table cell to its fixed display width. */
function padCell(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

/** One display formula as Markdown. */
function mathMarkdown(math: string): string {
  return `$$\n${math}\n$$`;
}

/** A quoted Pandoc attribute value. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
