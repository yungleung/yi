/**
 * One display equation as accessible processed-Markdown HTML.
 *
 * KaTeX's MathML output carries the formula and its original TeX annotation.
 * Yi adds the shared two-cell layout and the number of a labeled equation, so
 * common Markdown readers do not need to interpret an equation environment.
 *
 * May import: KaTeX, caption attributes, and shared HTML escaping. Upholds: the
 * ID, classes, data attributes, formula, layout, and number survive without
 * duplicate native tags.
 */

import katex from 'katex';
import type { EquationBlockSource } from '../../markdown/syntax/equation_blocks';
import { escapeHtml, htmlAttributeName } from './html';

/** One display equation as an HTML block. */
export function equationHtml(
  equation: EquationBlockSource | null,
  math: string,
  numberText: string
): string {
  const rendered = katex.renderToString(math, {
    displayMode: true,
    throwOnError: false,
    output: 'mathml'
  });
  const number =
    numberText === ''
      ? ''
      : `<span class="equation-number">${escapeHtml(numberText)}</span>`;
  return equationHtmlContainer(
    equation,
    [equationLayoutHtml(rendered, number)],
    ['equation-layout']
  );
}

/** The shared borderless layout table around one formula and its reserved number cell. */
export function equationLayoutHtml(math: string, number: string): string {
  return [
    '<table class="equation-layout" role="presentation" style="width: 100%; border: none; border-collapse: collapse;">',
    '<tbody style="border: none;">',
    '<tr>',
    '<td class="equation-math-cell" style="width: 90%; border: none; vertical-align: middle;">',
    '',
    math,
    '',
    '</td>',
    '<td class="equation-number-cell" style="width: 10%; min-width: 4em; border: none; text-align: left; vertical-align: middle;">',
    '',
    number,
    '',
    '</td>',
    '</tr>',
    '</tbody>',
    '</table>'
  ].join('\n');
}

/** One layout Div around content that may itself contain Markdown parsed by Pandoc. */
export function equationHtmlContainer(
  equation: EquationBlockSource | null,
  content: readonly string[],
  extraClasses: readonly string[] = []
): string {
  const classes = [
    ...(equation?.id == null ? [] : ['equation-target']),
    ...extraClasses,
    ...(equation?.classes ?? [])
  ];
  const attributes = [
    ...(equation?.id == null ? [] : [`id="${escapeHtml(equation.id)}"`]),
    `class="${escapeHtml(classes.join(' '))}"`,
    ...Object.entries(equation?.attributes ?? {}).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  return [`<div ${attributes.join(' ')}>`, ...content, '</div>'].join('\n');
}
