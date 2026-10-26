/**
 * One labeled equation as accessible processed-Markdown HTML.
 *
 * KaTeX's MathML output carries the formula and its original TeX annotation.
 * Yi appends the one visible number, so common Markdown readers do not need to
 * interpret an equation environment themselves.
 *
 * May import: KaTeX, caption attributes, and shared HTML escaping. Upholds: the
 * ID, classes, data attributes, formula, and number survive without duplicate
 * native tags.
 */

import katex from 'katex';
import type { EquationBlockSource } from '../markdown/syntax/equation_blocks';
import { escapeHtml, htmlAttributeName } from './html';

/** One labeled equation as an HTML block. */
export function equationHtml(
  equation: EquationBlockSource,
  math: string,
  numberText: string
): string {
  const rendered = katex.renderToString(math, {
    displayMode: true,
    throwOnError: false,
    output: 'mathml'
  });
  return equationHtmlContainer(equation, [
    `  ${rendered}`,
    `  <span class="equation-number">${escapeHtml(numberText)}</span>`
  ]);
}

/** One target Div around content that may itself contain Markdown parsed by Pandoc. */
export function equationHtmlContainer(
  equation: EquationBlockSource,
  content: readonly string[],
  extraClasses: readonly string[] = []
): string {
  const classes = ['equation-target', ...extraClasses, ...equation.classes];
  const attributes = [
    ...(equation.id === null ? [] : [`id="${escapeHtml(equation.id)}"`]),
    `class="${escapeHtml(classes.join(' '))}"`,
    ...Object.entries(equation.attributes).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  return [`<div ${attributes.join(' ')}>`, ...content, '</div>'].join('\n');
}
