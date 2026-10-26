/**
 * One captioned table as processed-Markdown HTML.
 *
 * The table keeps the parse's row and alignment model while inline Markdown in
 * cells and the caption becomes ordinary HTML. Yi's generated number is text
 * inside the native `<caption>`, never a second source representation.
 *
 * May import: the AST vocabulary, caption metadata, and shared HTML escaping.
 * Upholds: ids, classes, attributes, and inline content survive without
 * exposing Pandoc-only caption syntax to a common Markdown reader.
 */

import type { AlignType, RootContent } from 'mdast';
import type { TableCaptionNode } from '../markdown/syntax/table_captions';
import { escapeHtml, htmlAttributeName } from './html';
import { inlineHtml } from './inline_html';

interface InlineNode {
  type: string;
  value?: unknown;
  url?: unknown;
  title?: unknown;
  alt?: unknown;
  identifier?: unknown;
  label?: unknown;
  children?: InlineNode[];
}

interface TableRowNode {
  children: InlineNode[];
}

interface CaptionedTable {
  tableCaption?: TableCaptionNode;
  align?: readonly AlignType[] | null;
  children: TableRowNode[];
}

/** Render one captioned table, including its visible numbered caption, as HTML. */
export function tableHtml(table: CaptionedTable, label: string): string {
  const caption = table.tableCaption;
  if (caption === undefined) {
    return '';
  }
  const attributes = [
    ...(caption.id === null ? [] : [`id="${escapeHtml(caption.id)}"`]),
    ...(caption.classes.length === 0
      ? []
      : [`class="${escapeHtml(caption.classes.join(' '))}"`]),
    ...Object.entries(caption.attributes).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  const rows = table.children.map((row) => row.children);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  return [
    `<table${attributes.length === 0 ? '' : ` ${attributes.join(' ')}`}>`,
    `  <caption>${visibleCaption(label, caption.children)}</caption>`,
    '  <thead>',
    rowHtml(header, table.align ?? [], true),
    '  </thead>',
    '  <tbody>',
    ...body.map((row) => rowHtml(row, table.align ?? [], false)),
    '  </tbody>',
    '</table>'
  ].join('\n');
}

/** One table row and its cells, indented under the table's section. */
function rowHtml(
  cells: readonly InlineNode[],
  align: readonly AlignType[],
  header: boolean
): string {
  const tag = header ? 'th' : 'td';
  return [
    '    <tr>',
    ...cells.map((cell, column) => {
      const direction = align[column];
      const style =
        direction === undefined || direction === null
          ? ''
          : ` style="text-align: ${escapeHtml(direction)}"`;
      return `      <${tag}${style}>${inlineHtml(cell.children ?? [])}</${tag}>`;
    }),
    '    </tr>'
  ].join('\n');
}

/** The generated number followed by the caption's own inline Markdown. */
function visibleCaption(label: string, children: readonly RootContent[]): string {
  const text = inlineHtml(children as InlineNode[]);
  return text === '' ? `${escapeHtml(label)}.` : `${escapeHtml(label)}. ${text}`;
}

