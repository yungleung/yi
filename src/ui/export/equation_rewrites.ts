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

import { referenceLabel, type ReferenceEntry } from '../markdown/document/reference_index';
import { splitBlocks } from '../markdown/document/blocks';
import {
  innerEquationBody,
  latexEquationBody,
  readDisplayMath,
  readEquationBlock,
  unnumberedEquationBody
} from '../markdown/syntax/equation_blocks';
import { equationHtml } from './equation_html';

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
    const label = referenceLabel(entry);
    const math = innerEquationBody(equation.body);
    rewrites.push({
      start: block.charStart,
      end: block.charEnd,
      text:
        kind === 'markdown'
          ? equationHtml(equation, math, label)
          : equationMarkdown(equation, math, label)
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
  label: string
): string {
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
    mathMarkdown(math),
    '',
    label,
    ':::'
  ].join('\n');
}

/** One display formula as Markdown. */
function mathMarkdown(math: string): string {
  return `$$\n${math}\n$$`;
}

/** A quoted Pandoc attribute value. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
