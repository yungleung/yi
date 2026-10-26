/**
 * Lowers captioned tables to each export kind's portable Markdown or HTML.
 *
 * Pandoc kinds receive the author's table source. HTML and EPUB only prefix
 * the visible caption; DOCX and ODT also wrap an explicit ID in a Div; processed
 * Markdown replaces the complete table with semantic HTML.
 *
 * May import: the parse walk, reference index, caption metadata, and table HTML
 * renderer. Upholds: only captioned tables change, source inside ordinary tables
 * stays byte-for-byte, and nested rewrites never share an overlapping span.
 */

import type { Table } from 'mdast';
import { referenceLabel, type ReferenceEntry } from '../markdown/document/reference_index';
import type { TableCaptionNode } from '../markdown/syntax/table_captions';
import { spansOfType, type Walkable } from './node_spans';
import { tableHtml } from './table_html';

/** One source range and its replacement. */
export interface TableRewrite {
  start: number;
  end: number;
  text: string;
}

interface CaptionedTable extends Table {
  tableCaption?: TableCaptionNode;
}

/** Every rewrite captioned tables need for one export kind. */
export function tableRewrites(
  tree: Walkable,
  references: readonly ReferenceEntry[],
  kind: string
): TableRewrite[] {
  if (kind === 'latex' || kind === 'pdf') {
    return [];
  }
  const rewrites: TableRewrite[] = [];
  for (const span of spansOfType(tree, 'table')) {
    const table = span.node as unknown as CaptionedTable;
    const caption = table.tableCaption;
    if (caption === undefined) {
      continue;
    }
    const entry = references.find(
      (candidate) => candidate.kind === 'table' && candidate.from === span.start
    );
    if (entry === undefined) {
      continue;
    }
    const label = referenceLabel(entry);
    if (kind === 'markdown') {
      rewrites.push({
        start: span.start,
        end: span.end,
        text: tableHtml(table, label)
      });
      continue;
    }
    if (!wordWriters(kind)) {
      const text = caption.captionData;
      rewrites.push({
        start: text.textFrom,
        end: text.textTo,
        text: captionText(label, text.caption)
      });
      continue;
    }
    rewrites.push({
      start: caption.captionData.captionFrom,
      end: caption.captionData.captionTo,
      text: wordCaption(label, caption)
    });
    if (caption.id !== null) {
      rewrites.push(
        { start: span.start, end: span.start, text: `::: {#${caption.id} .table-target}\n` },
        { start: span.end, end: span.end, text: '\n:::' }
      );
    }
  }
  return rewrites;
}

/** The writers for which Pandoc does not carry a table object's identifier. */
function wordWriters(kind: string): boolean {
  return kind === 'docx' || kind === 'odt';
}

/** A visible number followed by the caption's own inline Markdown. */
function captionText(label: string, caption: string): string {
  return caption === '' ? `${label}.` : `${label}. ${caption}`;
}

/** A DOCX/ODT caption with its ID moved to the enclosing Div and syntax normalized. */
function wordCaption(label: string, caption: TableCaptionNode): string {
  const tokens = [
    ...caption.classes.map((name) => `.${name}`),
    ...Object.entries(caption.attributes).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
  const attributes = tokens.length === 0 ? '' : ` {${tokens.join(' ')}}`;
  return `: ${captionText(label, caption.captionData.caption)}${attributes}`;
}

/** A quoted Pandoc attribute value. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
