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
export function equationHtml(equation: EquationBlockSource, math: string, label: string): string {
  const classes = ['equation-target', ...equation.classes];
  const attributes = [
    ...(equation.id === null ? [] : [`id="${escapeHtml(equation.id)}"`]),
    `class="${escapeHtml(classes.join(' '))}"`,
    ...Object.entries(equation.attributes).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  const rendered = katex.renderToString(math, {
    displayMode: true,
    throwOnError: false,
    output: 'mathml'
  });
  return [
    `<div ${attributes.join(' ')}>`,
    `  ${rendered}`,
    `  <span class="equation-number">${escapeHtml(label)}</span>`,
    '</div>'
  ].join('\n');
}
