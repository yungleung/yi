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
 * Everything here is pure text: labels, the shape of the `[^label]` a footnote is
 * written as, offsets, numbering, and the single edit that writes a new marker and
 * its definition line.
 *
 * May import: nothing — the raw document text is passed in. Upholds: one fact
 * about markdown syntax has one home, and this is the home of footnote labels,
 * their offsets and their numbering.
 */

import type { TextEdit } from './edit_range';

/**
 * What a definition line may sit behind: markdown's container openers — a quote
 * marker, a list marker — and the spaces it allows at the start of a line or an
 * item's content, repeated because containers nest (`> - [^1]: the note`).
 *
 * A definition written inside a container is a definition of the *document*:
 * markdown collects them from anywhere, and this editor borrows them across
 * blocks by their line shape (`withFootnoteDefinitions`), so the shape has to
 * look past the container's own markers — a `> [^1]: note` inside a blockquote
 * defines its label for a reference in any other block. At the top level the
 * spaces are still capped at three: `    [^1]: note` is an indented code block,
 * and reads as the text it is.
 *
 * One shape is deliberately outside it, and it leaves the line as the text it is
 * rather than invent a definition: a container whose content column is wider than
 * the three spaces read here — a `10. ` item, a nested list — whose definitions
 * sit four or more columns in, exactly like an indented code block that the line
 * alone cannot be told apart from. `docs/roadmap.md` records it as a residue.
 */
const CONTAINERS = '(?: {0,3}(?:>[ \\t]+|[-*+][ \\t]+|\\d+[.)][ \\t]+))* {0,3}';
/** The label a definition line defines, or null. */
const DEFINITION = new RegExp(`^${CONTAINERS}\\[\\^([^\\]\\n]+)\\]:`, 'gm');
/**
 * A line that starts a definition. Kept separate from `DEFINITION` on purpose:
 * that one is global, so it carries a last-index between calls, which a plain
 * `test` would inherit.
 */
const DEFINITION_START = new RegExp(`^${CONTAINERS}\\[\\^[^\\]\\n]+\\]:`);
/** A reference: a labelled bracket that is not a definition. */
const REFERENCE = /\[\^([^\]\n]+)\](?!:)/g;
/** The same shape, without the global flag, for a caller that only asks *whether*. */
const REFERENCE_SHAPE = /\[\^[^\]\n]+\](?!:)/;

/** The labels of the definitions the document holds. */
export function footnoteLabels(text: string): Set<string> {
  const labels = new Set<string>();
  for (const match of text.matchAll(DEFINITION)) {
    labels.add(match[1]);
  }
  return labels;
}

/** Whether a piece of text holds a marker a definition could turn into a reference. */
export function containsReference(text: string): boolean {
  return REFERENCE_SHAPE.test(text);
}

/** Whether two sets of labels hold the same labels. */
export function sameLabels(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) {
    return true;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const label of a) {
    if (!b.has(label)) {
      return false;
    }
  }
  return true;
}

/**
 * The `[^label]` a footnote is written as: the length of the whole marker, and where
 * the label's own characters sit inside it (`[^` … `]`).
 *
 * This is the one home of the marker's shape. Everything that has to know where a
 * marker's label begins and ends asks here: a source view of a marker enters at the
 * label's end and edits inside the marker (`nodes/footnote.ts`), and a definition's
 * label is the part of the definition the caret shows the source of
 * (`editing/context.ts`), so the two cannot disagree about the characters a caret
 * inside a label is inside.
 */
export function markerShape(label: string): {
  end: number;
  label: { start: number; end: number };
} {
  const end = label.length + 3;
  return { end, label: { start: 2, end: end - 1 } };
}

/**
 * A replacement of a range of the raw text: where it was, what it removed and
 * what it put in its place. The same shape the edit history records
 * (`document/history.ts`, `DocumentEdit`), written out here because this module
 * reads raw text and never the editor that made it.
 */
export interface TextReplacement {
  from: number;
  to: number;
  removed: string;
  inserted: string;
}

/** Whether a piece of text holds a line that defines a footnote. */
const DEFINITION_LINE = new RegExp(`^${CONTAINERS}\\[\\^[^\\]\\n]+\\]:`, 'm');

/**
 * The labels the document defines after `edit`, given the labels it had.
 *
 * A definition is a whole line — `[^1]: note` — so an edit changes which labels
 * exist by changing which lines are definitions: typing `[^1]: ` on a line
 * starts one, typing a character in front of one stops it being one, and moving
 * a line boundary can leave a definition's own `[^x]:` in the middle of the line
 * that swallowed it. When the edit can do none of those things, no line has
 * changed what it defines and the set is the set it was; when it can, the
 * document is scanned again. Falling back costs a scan the edit did not need;
 * being wrong costs a reference that silently stops parsing as a footnote.
 */
export function labelsAfterEdit(
  labels: ReadonlySet<string>,
  text: string,
  edit: TextReplacement
): ReadonlySet<string> {
  if (definesALine(edit.removed) || definesALine(edit.inserted) || movesALine(edit)) {
    return footnoteLabels(text);
  }
  const line = lineAt(text, edit.from + edit.inserted.length);
  if (definesALine(line.text) || definesALine(lineBefore(line, edit))) {
    return footnoteLabels(text);
  }
  return labels;
}

/** Whether a document — or a piece of one — holds a definition line. */
function definesALine(text: string): boolean {
  return DEFINITION_LINE.test(text);
}

/** Whether the edit removes or adds a line ending, which moves every line below. */
function movesALine(edit: TextReplacement): boolean {
  return edit.removed.includes('\n') || edit.inserted.includes('\n');
}

/** The line of `text` that holds `offset`, and where it starts. */
function lineAt(text: string, offset: number): { text: string; start: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  const start = text.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const end = text.indexOf('\n', at);
  return { text: text.slice(start, end === -1 ? text.length : end), start };
}

/**
 * The line the edit landed on as it was before the edit: what it inserted
 * swapped back for what it removed. Only an edit inside one line has a line
 * that was there before — an edit that moves a line ending is scanned for
 * anyway.
 */
function lineBefore(line: { text: string; start: number }, edit: TextReplacement): string {
  const at = Math.max(0, edit.from - line.start);
  return `${line.text.slice(0, at)}${edit.removed}${line.text.slice(at + edit.inserted.length)}`;
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
  const reference = new RegExp(`\\[\\^${escaped}\\](?!:)`, 'i').exec(text);
  const definition = new RegExp(`^${CONTAINERS}\\[\\^${escaped}\\]:[ \\t]*`, 'im').exec(text);
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
 * Whether a node of such a parse belongs to the caller's own text, rather than to the
 * definitions borrowed for it: the borrowed lines are appended, so their nodes start
 * after that text ends.
 *
 * The nodes have to be dropped, not just ignored: they are markdown like any other, and
 * rendering them would put a note the document keeps elsewhere inside the block that
 * borrowed it.
 */
export function isOwnNode(node: unknown, length: number): boolean {
  const start = (node as { position?: { start?: { offset?: number } } }).position?.start?.offset;
  return start === undefined || start < length;
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
