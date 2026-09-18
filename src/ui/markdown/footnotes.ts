/**
 * Footnotes, read from the raw document.
 *
 * A footnote is a pair: a reference in the text (`[^1]`) and a definition line
 * somewhere below (`[^1]: the note`). Markdown only *reads* a reference as a
 * footnote when its definition is part of the same parse, and this editor
 * parses one block at a time — so the block being parsed is given the
 * definitions its references need (see `withFootnoteDefinitions`), and the
 * nodes that come from that borrowed text are dropped again.
 *
 * Everything here is pure text: labels, offsets, numbering, and the single
 * edit that writes a new marker and its definition line.
 */

import type { TextEdit } from './edit_range';

/** The label a definition line defines, or null. */
const DEFINITION = /^ {0,3}\[\^([^\]\n]+)\]:/gm;
/** A reference: a labelled bracket that is not a definition. */
const REFERENCE = /\[\^([^\]\n]+)\](?!:)/g;

/** The labels of the definitions the document holds. */
export function footnoteLabels(text: string): Set<string> {
  const labels = new Set<string>();
  for (const match of text.matchAll(DEFINITION)) {
    labels.add(match[1]);
  }
  return labels;
}

/** The number a new footnote takes: one past the highest numbered label. */
export function nextFootnoteNumber(text: string): number {
  let highest = 0;
  for (const label of footnoteLabels(text)) {
    if (/^\d+$/.test(label)) {
      highest = Math.max(highest, Number.parseInt(label, 10));
    }
  }
  return highest + 1;
}

function escapeLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface FootnoteOffsets {
  /** Where the first reference to the label sits, or null. */
  reference: number | null;
  /** Just past that reference. */
  referenceEnd: number | null;
  /** Where the definition's own text starts, or null. */
  definitionBody: number | null;
}

/** Where a label's reference and definition sit in the document. */
export function footnoteOffsets(text: string, label: string): FootnoteOffsets {
  const escaped = escapeLabel(label);
  const reference = new RegExp(`\\[\\^${escaped}\\](?!:)`).exec(text);
  const definition = new RegExp(`^ {0,3}\\[\\^${escaped}\\]:[ \\t]*`, 'm').exec(text);
  return {
    reference: reference ? reference.index : null,
    referenceEnd: reference ? reference.index + reference[0].length : null,
    definitionBody: definition ? definition.index + definition[0].length : null
  };
}

/**
 * The parse input for a block, with the definitions its references need.
 *
 * Only labels the document defines *elsewhere* are appended, so a block that
 * carries its own definition is parsed as it stands. The appended lines are
 * plain text after the block's own text: the caller drops the nodes they parse
 * into, and because they sit at the end, every position the real content has
 * is unchanged.
 */
export function withFootnoteDefinitions(blockText: string, defined: ReadonlySet<string>): string {
  if (defined.size === 0) {
    return blockText;
  }
  const definedHere = new Set<string>();
  for (const match of blockText.matchAll(DEFINITION)) {
    definedHere.add(match[1]);
  }
  const needed = new Set<string>();
  for (const match of blockText.matchAll(REFERENCE)) {
    const label = match[1];
    if (defined.has(label) && !definedHere.has(label)) {
      needed.add(label);
    }
  }
  if (needed.size === 0) {
    return blockText;
  }
  return `${blockText}${[...needed].map((label) => `\n\n[^${label}]: x`).join('')}`;
}

/**
 * The one edit the footnote button makes: the marker at the caret, and the
 * definition line at the end of the document.
 *
 * The definition goes on the very next line — markdown does not require a
 * blank line in front of a definition, and a tight document is easier to read.
 * Newlines the document already ends with are left as they are: they are
 * content (an empty paragraph is a block here), not separation this edit owns.
 */
export function footnoteInsertEdit(text: string, caret: number, label: string): TextEdit {
  const tail = text.slice(caret);
  const trailingNewlines = /(\n*)$/.exec(tail)?.[1].length ?? 0;
  const separator = trailingNewlines === 0 ? '\n' : '';
  return {
    from: caret,
    to: text.length,
    replacement: `[^${label}]${tail}${separator}[^${label}]: `
  };
}
