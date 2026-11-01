/**
 * Reads a Pandoc table caption line.
 *
 * The line begins with `:` and separation whitespace, carries inline
 * Markdown, and may end in one Pandoc attribute block. This module owns only
 * that source grammar; attaching the caption to its table and parsing the
 * caption's inline Markdown happen later.
 *
 * May import: the shared Pandoc attribute grammar. Upholds: malformed or
 * non-final attributes remain caption text and create no target.
 */

import type { RootContent } from 'mdast';
import { readTableSource } from './source';
import { captionLine, type CaptionLineData } from '../caption';

/** One caption line, with every range in its block's coordinates. */
export interface TableCaptionData extends CaptionLineData {}

/** One caption and the table source it follows. */
export interface TableCaptionAttachment {
  tableFrom: number;
  tableTo: number;
  separatorFrom: number | null;
  separatorTo: number | null;
  caption: TableCaptionData;
}

/** The parsed caption node the renderer and export pipeline consume. */
export interface TableCaptionNode {
  type: 'tableCaption';
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  children: RootContent[];
  source: string;
  captionData: TableCaptionData;
  /** The table's block-relative start: the key the shared index numbers it by. */
  tableFrom: number;
  /** Block-relative start of the optional blank separator. */
  separatorFrom: number | null;
  separated: boolean;
  position: {
    start: { offset: number };
    end: { offset: number };
  };
}

/** The caption after a table beginning at `tableFrom`, when one is attached. */
export function tableCaptionAfterTable(
  markdown: string,
  tableFrom: number
): TableCaptionAttachment | null {
  const table = readTableSource(markdown.slice(tableFrom));
  if (table === null || table.from !== 0) {
    return null;
  }
  const tableTo = tableFrom + table.to;
  const direct = lineAt(markdown, tableTo + 1);
  if (direct === null) {
    return null;
  }
  const directCaption = tableCaptionLine(direct.text, direct.start);
  if (directCaption !== null) {
    return {
      tableFrom,
      tableTo,
      separatorFrom: null,
      separatorTo: null,
      caption: directCaption
    };
  }
  if (direct.text.trim() !== '') {
    return null;
  }
  const separated = lineAt(markdown, direct.end + 1);
  if (separated === null) {
    return null;
  }
  const caption = tableCaptionLine(separated.text, separated.start);
  return caption === null
    ? null
    : {
        tableFrom,
        tableTo,
        separatorFrom: direct.start,
        separatorTo: direct.end,
        caption
      };
}

/**
 * The caption data on one line, or null when the line is not a caption.
 *
 * `from` is the line's block-relative start. A caption needs non-empty inline
 * text or a non-empty ID; whitespace alone remains ordinary source.
 */
export function tableCaptionLine(line: string, from: number): TableCaptionData | null {
  return captionLine(line, from);
}

/** Whether a line carries the table-caption marker. */
export function isTableCaptionLine(line: string): boolean {
  return tableCaptionLine(line, 0) !== null;
}

/** One source line beginning at `start`, or null when `start` is past its end. */
function lineAt(
  text: string,
  start: number
): { start: number; end: number; text: string } | null {
  if (start <= 0 || start > text.length) {
    return null;
  }
  const breakAt = text.indexOf('\n', start);
  const end = breakAt < 0 ? text.length : breakAt;
  return { start, end, text: text.slice(start, end) };
}
