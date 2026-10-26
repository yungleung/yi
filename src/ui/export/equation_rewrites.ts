/**
 * Lowers display equations for every export kind.
 *
 * Ordinary KaTeX environments are made unnumbered. A labeled wrapper becomes
 * one target with one Yi number; LaTeX/PDF keeps native equation lowering for
 * the following task, while the other writers receive Markdown or MathML.
 *
 * May import: the equation grammar, block splitter, reference index, and
 * equation HTML renderer. Upholds: one labeled block is at most one
 * target and native row numbering never survives a writer.
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
  unnumberedEquationBody
} from '../markdown/syntax/equation_blocks';
import { equationHtml, equationHtmlContainer } from './equation_html';

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
    if (entry === undefined) {
      rewrites.push({
        start: block.charStart,
        end: block.charEnd,
        text: mathMarkdown(unnumberedEquationBody(equation.body))
      });
      continue;
    }
    if (kind === 'latex' || kind === 'pdf') {
      rewrites.push({
        start: block.charStart,
        end: block.charEnd,
        text: mathMarkdown(latexEquationBody(equation.body, entry.id ?? ''))
      });
      continue;
    }
    const numberText = equationBlockNumber(entry) ?? '';
    const math = innerEquationBody(equation.body);
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
    if (lowered === math.math) {
      continue;
    }
    rewrites.push({
      start: block.charStart + math.mathFrom,
      end: block.charStart + math.mathTo,
      text: lowered
    });
  }
  return rewrites;
}

/** A labeled equation as a Pandoc target Div and one visible number. */
function equationMarkdown(
  equation: ReturnType<typeof readEquationBlock> & object,
  math: string,
  numberText: string,
  kind: string
): string {
  if (kind === 'html' || kind === 'epub') {
    return equationHtmlContainer(
      equation,
      [
        '<table class="equation-layout" role="presentation" style="width: 100%; border: none;">',
        '<tbody>',
        '<tr>',
        '<td class="equation-math-cell" style="width: 90%; vertical-align: middle;">',
        '',
        mathMarkdown(math),
        '',
        '</td>',
        '<td class="equation-number-cell" style="width: 10%; text-align: right; vertical-align: middle;">',
        '',
        equationNumberMarkdown(numberText),
        '',
        '</td>',
        '</tr>',
        '</tbody>',
        '</table>'
      ],
      ['equation-layout']
    );
  }

  const tokens = [
    ...(equation.id === null ? [] : [`#${equation.id}`]),
    '.equation-target',
    ...equation.classes.map((name) => `.${name}`),
    ...Object.entries(equation.attributes).map(
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
  const formulaWidth = Math.max(48, formula.length + 2);
  const numberWidth = Math.max(10, Math.ceil(formulaWidth * 0.18), number.length + 2);
  const border = `+${'-'.repeat(formulaWidth + 2)}+${'-'.repeat(numberWidth + 2)}+`;
  return [
    border,
    `| ${padCell(formula, formulaWidth)} | ${padCell(number, numberWidth)} |`,
    border
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
