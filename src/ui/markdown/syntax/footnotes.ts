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
 *
 * May import: nothing — the raw document text is passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of footnote labels,
 * their offsets and their numbering.
 */

import type { TextEdit } from './edit_range';

/** The label a definition line defines, or null. */
const DEFINITION = /^ {0,3}\[\^([^\]\n]+)\]:/gm;
/**
 * A line that starts a definition. Kept separate from `DEFINITION` on purpose:
 * that one is global, so it carries a last-index between calls, which a plain
 * `test` would inherit.
 */
const DEFINITION_START = /^ {0,3}\[\^[^\]\n]+\]:/;
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
 * The notes are a part of the document of their own: the *first* definition is
 * set off by a blank line, and every definition after it follows the one above
 * directly, so the notes read as one list. Newlines the document already ends
 * with are left as they are — an empty paragraph is a block here, not
 * separation this edit owns — and the definition line is terminated, so a
 * document that ended with a newline still ends with one: a text file's last
 * line is meant to end with a line ending.
 */
export function footnoteInsertEdit(text: string, caret: number, label: string): TextEdit {
  const tail = text.slice(caret);
  const trailingNewlines = /(\n*)$/.exec(tail)?.[1].length ?? 0;
  const separator = notesAreOpen(text, trailingNewlines)
    ? trailingNewlines >= 1
      ? ''
      : '\n'
    : '\n'.repeat(Math.max(0, 2 - trailingNewlines));
  return {
    from: caret,
    to: text.length,
    replacement: `[^${label}]${tail}${separator}[^${label}]: \n`
  };
}

/**
 * Whether the document already ends inside the notes, in which case the new
 * definition joins them instead of starting them.
 *
 * The document's last run of non-blank lines is what decides: if one of those
 * lines starts a definition, the run is the notes.
 */
function notesAreOpen(text: string, trailingNewlines: number): boolean {
  const before = text.slice(0, text.length - trailingNewlines);
  const lines = before.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.trim() === '') {
      return false;
    }
    if (DEFINITION_START.test(line)) {
      return true;
    }
  }
  return false;
}
