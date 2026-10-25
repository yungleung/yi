/**
 * The document-wide targets that manual and automatic cross-references can name.
 *
 * The index is derived from the document parse and ordered by source position.
 * It currently joins the existing heading target rule; later element
 * specifications add their own target collectors through the same vocabulary.
 *
 * May import: the markdown parser and the automatic heading-identifier rule.
 * Upholds: the document text is the only source of truth — target positions,
 * numbers, and duplicate resolution are all derived from that text.
 */

import type { Heading, RootContent } from 'mdast';
import { parseMarkdown } from '../syntax/parser';
import { pandocHeadingId } from '../syntax/pandoc_identifiers';
import {
  referenceKindText,
  referenceVocabularyFromTree,
  type NumberedReferenceKind,
  type ReferenceStyle
} from '../syntax/reference_vocabulary';
import type { TableCaptionNode } from '../syntax/table_captions';

/** A target kind with a document-configured reference name. */
export type ReferenceKind = 'heading' | 'figure' | 'table';

/** One entry in document order. A target needs an ID; a numbered figure may not. */
export interface ReferenceEntry {
  id: string | null;
  kind: ReferenceKind;
  from: number;
  to: number;
  number: number | null;
  title: string;
  /** The document-owned kind word used by an automatic reference. */
  label: string;
  /** Literal text placed before a numbered kind's sequential number. */
  numberPrefix: string;
  /** Where navigation places the caret; null uses `from`. */
  caretAt: number | null;
  explicit: boolean;
}

/** Build all referenceable and number-consuming targets. */
export function referenceIndex(markdown: string): ReferenceEntry[] {
  const tree = parseMarkdown(markdown);
  const vocabulary = referenceVocabularyFromTree(tree);
  const used = new Set<string>();
  let figureNumber = 0;
  let tableNumber = 0;
  const entries: ReferenceEntry[] = [];
  walk(tree.children);
  return entries;

  function walk(children: readonly RootContent[]): void {
    for (const child of children) {
      if (child.type === 'heading') {
        addHeading(child);
      } else if (child.type === 'figure') {
        addFigure(child);
      } else if (child.type === 'table') {
        addTable(child);
      }
      const nested = (child as { children?: RootContent[] }).children;
      if (Array.isArray(nested)) {
        walk(nested);
      }
    }
  }

  function addHeading(heading: Heading): void {
    const start = heading.position?.start.offset;
    const end = heading.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    const title = plainHeadingText(heading);
    const explicit = heading.headingAttributes?.id ?? null;
    let id = explicit;
    if (id === null) {
      const base = pandocHeadingId(title);
      id = base;
      let suffix = 1;
      while (used.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
    }
    used.add(id);
    entries.push({
      id,
      kind: 'heading',
      from: start,
      to: end,
      number: null,
      title,
      label: title,
      numberPrefix: '',
      caretAt: start,
      explicit: explicit !== null
    });
  }

  function addFigure(figure: RootContent & {
    type: 'figure';
    id: string | null;
    children: [RootContent];
  }): void {
    const start = figure.position?.start.offset;
    const end = figure.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    figureNumber += 1;
    const image = figure.children[0] as { alt?: string | null };
    if (figure.id !== null) {
      used.add(figure.id);
    }
    entries.push({
      id: figure.id,
      kind: 'figure',
      from: start,
      to: end,
      number: figureNumber,
      title: String(image.alt ?? '').trim(),
      label: vocabulary.figure.label,
      numberPrefix: vocabulary.figure.prefix,
      caretAt: start,
      explicit: figure.id !== null
    });
  }

  function addTable(
    table: RootContent & {
      type: 'table';
      tableCaption?: TableCaptionNode;
      children: Array<{
        children: Array<{
          position?: { start: { offset?: number } };
          children?: Array<{ position?: { start: { offset?: number } } }>;
        }>;
      }>;
    }
  ): void {
    const caption = table.tableCaption;
    const start = table.position?.start.offset;
    const end = caption?.position.end.offset;
    if (!caption || start === undefined || end === undefined) {
      return;
    }
    tableNumber += 1;
    if (caption.id !== null) {
      used.add(caption.id);
    }
    entries.push({
      id: caption.id,
      kind: 'table',
      from: start,
      to: end,
      number: tableNumber,
      title: caption.children.map((child) => plainText(child)).join('').trim(),
      label: vocabulary.table.label,
      numberPrefix: vocabulary.table.prefix,
      caretAt:
        table.children[0]?.children[0]?.children?.[0]?.position?.start.offset ??
        table.children[0]?.children[0]?.position?.start.offset ??
        start,
      explicit: caption.id !== null
    });
  }
}

/** The first target with this ID, matching Pandoc's first-match duplicate behavior. */
export function firstReference(
  entries: readonly ReferenceEntry[],
  id: string
): ReferenceEntry | null {
  return entries.find((entry) => entry.id === id) ?? null;
}

/** The visible text of an automatic reference. */
export function referenceLabel(
  entry: ReferenceEntry
): string {
  if (entry.kind === 'heading' || entry.number === null) {
    return entry.title;
  }
  return referenceKindText(
    entry.kind as NumberedReferenceKind,
    entry.number,
    { label: entry.label, prefix: entry.numberPrefix } satisfies ReferenceStyle
  );
}

/** The plain text Pandoc's identifier rule reads from a heading's inline children. */
function plainHeadingText(heading: Heading): string {
  return heading.children.map((child) => plainText(child)).join('').trim();
}

/** Plain text for one heading child, omitting notes and formatting wrappers. */
function plainText(node: RootContent): string {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value;
  }
  if (node.type === 'break') {
    return ' ';
  }
  if (node.type === 'footnoteReference') {
    return '';
  }
  if (node.type === 'image') {
    return node.alt ?? '';
  }
  if ('value' in node && typeof node.value === 'string' && !('children' in node)) {
    return node.value;
  }
  const children = (node as { children?: RootContent[] }).children;
  return Array.isArray(children) ? children.map((child) => plainText(child)).join('') : '';
}
