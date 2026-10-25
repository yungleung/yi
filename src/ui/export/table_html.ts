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

/** Inline Markdown as the HTML a common Markdown reader can display. */
function inlineHtml(nodes: readonly InlineNode[]): string {
  return nodes.map(inlineNodeHtml).join('');
}

/** One inline node as escaped text and the standard inline HTML elements. */
function inlineNodeHtml(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(String(node.value ?? ''));
    case 'inlineCode':
      return `<code>${escapeHtml(String(node.value ?? ''))}</code>`;
    case 'strong':
      return `<strong>${inlineHtml(node.children ?? [])}</strong>`;
    case 'emphasis':
      return `<em>${inlineHtml(node.children ?? [])}</em>`;
    case 'delete':
      return `<del>${inlineHtml(node.children ?? [])}</del>`;
    case 'link':
      return `<a href="${escapeHtml(String(node.url ?? ''))}"${titleAttribute(node)}>` +
        `${inlineHtml(node.children ?? [])}</a>`;
    case 'image': {
      const alt = escapeHtml(String(node.alt ?? ''));
      return `<img src="${escapeHtml(String(node.url ?? ''))}" alt="${alt}"${titleAttribute(node)}>`;
    }
    case 'break':
      return '<br>';
    case 'html':
      return String(node.value ?? '');
    case 'inlineMath':
      return `<span class="math inline">${escapeHtml(String(node.value ?? ''))}</span>`;
    default:
      return node.children === undefined
        ? escapeHtml(String(node.value ?? ''))
        : inlineHtml(node.children);
  }
}

/** A link or image title, when one was written. */
function titleAttribute(node: InlineNode): string {
  return node.title == null ? '' : ` title="${escapeHtml(String(node.title))}"`;
}
