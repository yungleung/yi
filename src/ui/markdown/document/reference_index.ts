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

import type { Heading, List, RootContent } from 'mdast';
import { parseMarkdown } from '../syntax/parser';
import { pandocHeadingId } from '../syntax/pandoc';
import {
  referenceKindText,
  referenceVocabularyFromTree,
  type NumberedReferenceKind,
  type ReferenceStyle
} from '../syntax/reference_vocabulary';
import type { TableCaptionNode } from '../syntax/table';
import { readEquationBlock } from '../syntax/equation';
import { splitBlocks } from './block';

/** A target kind with a document-configured reference name. */
export type ReferenceKind =
  | 'heading'
  | 'figure'
  | 'listing'
  | 'table'
  | 'equation'
  | 'list'
  | 'theorem';

/** One entry in document order. A target needs an ID; a numbered figure may not. */
export interface ReferenceEntry {
  id: string | null;
  kind: ReferenceKind;
  from: number;
  to: number;
  number: number | string | null;
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
  const equationTargets = splitBlocks(markdown)
    .filter((block) => block.kind === 'equation')
    .flatMap((block) => {
      const equation = readEquationBlock(block.text);
      return equation?.id === null || equation === null
        ? []
        : [{ block, equation, id: equation.id, from: block.charStart }];
    });
  let figureNumber = 0;
  let listingNumber = 0;
  let listNumber = 0;
  let tableNumber = 0;
  const theoremCounters = new Map<string, number>();
  const headingCounters = [0, 0, 0, 0, 0, 0];
  const entries: ReferenceEntry[] = [];
  walk(tree.children);
  let equationNumber = 0;
  for (const { block, equation, id } of equationTargets) {
    equationNumber += 1;
    used.add(id);
    entries.push({
      id,
      kind: 'equation',
      from: block.charStart,
      to: block.charEnd,
      number: equationNumber,
      title: '',
      label: vocabulary.equation.label,
      numberPrefix: vocabulary.equation.prefix,
      caretAt: block.charStart + equation.mathFrom,
      explicit: true
    });
  }
  return entries.sort((one, other) => one.from - other.from);

  function walk(children: readonly RootContent[]): void {
    for (const child of children) {
      if (child.type === 'heading') {
        advanceHeading(child.depth);
        addHeading(child);
      } else if (child.type === 'figure') {
        addFigure(child);
      } else if (child.type === 'listing') {
        addListing(child);
      } else if (child.type === 'table') {
        addTable(child);
      } else if (child.type === 'list') {
        addList(child);
      } else if (child.type === 'theorem') {
        addTheorem(child);
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
      while (
        used.has(id) ||
        equationTargets.some((target) => target.id === id && target.from < start)
      ) {
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

  function addListing(listing: RootContent & {
    type: 'listing';
    id: string | null;
    caption: string | null;
    bodyStart: number;
  }): void {
    if (listing.id === null) {
      return;
    }
    const start = listing.position?.start.offset;
    const end = listing.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    listingNumber += 1;
    used.add(listing.id);
    entries.push({
      id: listing.id,
      kind: 'listing',
      from: start,
      to: end,
      number: listingNumber,
      title: listing.caption ?? '',
      label: vocabulary.listing.label,
      numberPrefix: vocabulary.listing.prefix,
      caretAt: start + listing.bodyStart,
      explicit: true
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

  function addList(list: List): void {
    const caption = list.listCaption;
    const start = list.position?.start.offset;
    if (!caption || start === undefined) {
      return;
    }
    listNumber += 1;
    if (caption.id !== null) {
      used.add(caption.id);
    }
    entries.push({
      id: caption.id,
      kind: 'list',
      from: start,
      to: caption.position.end.offset,
      number: listNumber,
      title: caption.children.map((child) => plainText(child)).join('').trim(),
      label: vocabulary.list.label,
      numberPrefix: vocabulary.list.prefix,
      caretAt: firstListContent(list, start),
      explicit: caption.id !== null
    });
  }

  function addTheorem(node: RootContent & {
    type: 'theorem';
    theorem: {
      id: string | null;
      bodyFrom: number;
      type: {
        className: string;
        displayName: string;
        counter: string;
        numbered: boolean;
        parentCounter:
          | 'part'
          | 'chapter'
          | 'section'
          | 'subsection'
          | 'subsubsection'
          | 'paragraph'
          | 'subparagraph'
          | null;
      };
    };
  }): void {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    let number: number | string | null = null;
    if (node.theorem.type.numbered) {
      const parent = node.theorem.type.parentCounter;
      const depth = parent === null ? 0 : parentHeadingDepth(parent);
      const prefix = headingCounters.slice(0, depth).join('.');
      const counterKey = `${node.theorem.type.counter}@${prefix}`;
      const next = (theoremCounters.get(counterKey) ?? 0) + 1;
      theoremCounters.set(counterKey, next);
      number = depth === 0 ? next : `${prefix}.${next}`;
    }
    const id = node.theorem.id;
    if (id !== null) {
      used.add(id);
    }
    entries.push({
      id,
      kind: 'theorem',
      from: start,
      to: end,
      number,
      title: node.theorem.type.displayName,
      label: node.theorem.type.displayName,
      numberPrefix: '',
      caretAt: node.theorem.bodyFrom,
      explicit: id !== null
    });
  }

  function advanceHeading(level: number): void {
    const index = Math.max(0, Math.min(5, level - 1));
    headingCounters[index] += 1;
    for (let deeper = index + 1; deeper < headingCounters.length; deeper += 1) {
      headingCounters[deeper] = 0;
    }
  }
}

function parentHeadingDepth(
  counter:
    | 'part'
    | 'chapter'
    | 'section'
    | 'subsection'
    | 'subsubsection'
    | 'paragraph'
    | 'subparagraph'
): number {
  switch (counter) {
    case 'part':
    case 'chapter':
    case 'section':
      return 1;
    case 'subsection':
      return 2;
    case 'subsubsection':
      return 3;
    case 'paragraph':
      return 4;
    case 'subparagraph':
      return 5;
  }
}

/** Where navigation enters the first item's editable content. */
function firstListContent(list: List, fallback: number): number {
  const item = list.children[0];
  const paragraph = item?.children.find((child) => child.type === 'paragraph');
  const first = paragraph?.children[0] as
    | { position?: { start: { offset?: number } } }
    | undefined;
  return (
    first?.position?.start.offset ??
    paragraph?.position?.start.offset ??
    item?.position?.start.offset ??
    fallback
  );
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
    entry.kind as NumberedReferenceKind | 'theorem',
    entry.number,
    { label: entry.label, prefix: entry.numberPrefix } satisfies ReferenceStyle
  );
}

/** The number shown beside an equation block, without its reference word. */
export function equationBlockNumber(entry: ReferenceEntry): string | null {
  if (entry.kind !== 'equation' || entry.number === null) {
    return null;
  }
  return `(${entry.numberPrefix}${entry.number})`;
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
