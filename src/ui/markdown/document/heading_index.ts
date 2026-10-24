/**
 * The headings a same-document cross-reference can reach, in document order.
 *
 * Explicit Pandoc identifiers win over generated ones. Automatic identifiers
 * avoid every identifier already used, including explicit ones, while duplicate
 * explicit identifiers remain as written so the export matches Pandoc.
 *
 * May import: the markdown parser and the automatic-identifier rule. Upholds:
 * the document text is the only source of truth — targets and their positions
 * are derived from a parse of that text.
 */

import type { Heading, RootContent } from 'mdast';
import { parseMarkdown } from '../syntax/parser';
import { pandocHeadingId } from '../syntax/pandoc_identifiers';

/** One heading a fragment can resolve to. */
export interface HeadingTarget {
  /** The explicit or automatic Pandoc identifier. */
  id: string;
  /** Document offset of the heading's first marker. */
  from: number;
  /** Document offset just after the heading source. */
  to: number;
  /** Plain heading text, without the trailing attribute block. */
  title: string;
  /** Whether the author supplied the identifier. */
  explicit: boolean;
}

/** Every heading target in document order. */
export function headingIndex(markdown: string): HeadingTarget[] {
  const tree = parseMarkdown(markdown);
  const used = new Set<string>();
  const targets: HeadingTarget[] = [];
  walk(tree.children);
  return targets;

  function walk(children: readonly RootContent[]): void {
    for (const child of children) {
      if (child.type === 'heading') {
        addHeading(child);
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
    targets.push({ id, from: start, to: end, title, explicit: explicit !== null });
  }
}

/** The first heading with this ID, or null. */
export function firstHeadingTarget(
  targets: readonly HeadingTarget[],
  id: string
): HeadingTarget | null {
  return targets.find((target) => target.id === id) ?? null;
}

/** The text Pandoc's identifier rule reads from a heading's inline children. */
function plainHeadingText(heading: Heading): string {
  return heading.children
    .map((child) => plainText(child))
    .join('')
    .trim();
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
