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

/** A target kind with a localized reference name. */
export type ReferenceKind = 'heading' | 'figure';

/** One entry in document order. A target needs an ID; a numbered figure may not. */
export interface ReferenceEntry {
  id: string | null;
  kind: ReferenceKind;
  from: number;
  to: number;
  number: number | null;
  title: string;
  explicit: boolean;
}

/** Build all referenceable and number-consuming targets. */
export function referenceIndex(markdown: string): ReferenceEntry[] {
  const tree = parseMarkdown(markdown);
  const used = new Set<string>();
  let figureNumber = 0;
  const entries: ReferenceEntry[] = [];
  walk(tree.children);
  return entries;

  function walk(children: readonly RootContent[]): void {
    for (const child of children) {
      if (child.type === 'heading') {
        addHeading(child);
      } else if (child.type === 'figure') {
        addFigure(child);
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
      explicit: figure.id !== null
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
  entry: ReferenceEntry,
  translate: (key: string) => string
): string {
  if (entry.kind === 'heading' || entry.number === null) {
    return entry.title;
  }
  const kind = translate(`reference.${entry.kind}`);
  return `${kind} ${entry.number}`;
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
