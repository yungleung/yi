/**
 * The markdown pipeline: parse one slice of raw text into an mdast tree, and
 * serialize a node back to markdown.
 *
 * Every block is parsed from its own slice, with the repairs markdown needs to
 * survive block-by-block parsing applied around the parse (see
 * `bare_markers.ts`, `empty_items.ts`, `footnotes.ts`), and the plugins the editor added
 * (citations, wikilinks, description lists) mounted here once.
 *
 * May import: the parser libraries, the remark plugins that extend them, and the
 * syntax modules that repair their output. Upholds: one fact about markdown
 * syntax has one home — this module says which pipeline turns text into nodes,
 * and nothing else in the editor parses markdown.
 */

import { unified } from 'unified';
import remarkDeflist from 'remark-deflist';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import type { Root, RootContent } from 'mdast';
import { restoreEmptyItems } from './empty_items';
import { restoreBareMarkers } from './bare_markers';
import { restoreSpacedDestinations } from './spaced_destinations';
import { restoreFigures } from './figures';
import {
  tableCaptionAfterTable,
  type TableCaptionNode
} from './table_captions';
import type { CaptionLineData } from './caption_lines';
import {
  listCaptionAfterList,
  listCaptionsForParsers,
  type ListCaptionNode
} from './list_captions';
import { readTableSource } from './table_source';
import { restoreListings } from './listings';
import { frontmatterForParsers } from './markers';
import { equationsForParsers } from './equation_blocks';
import { calloutsForParsers, type CalloutSource } from './callouts';
import { footnoteLabels, isOwnNode, withFootnoteDefinitions } from './footnotes';
import { remarkCitation } from '../plugins/remark-citation/index';
import { remarkAutoReferences } from '../plugins/remark-auto-references';
import { remarkHeadingAttributes } from '../plugins/remark-heading-attributes';
import { remarkWikilink } from '../plugins/remark-wikilink/index';
import {
  remarkCallouts
} from '../plugins/remark-callouts';
import {
  flattenUnwritableNodes,
  serializeMarkdown,
  stringifyMarkdownNode
} from './serializer';

export { serializeMarkdown };

const parseProcessor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkCallouts)
  .use(remarkDeflistCompat)
  .use(remarkDeflist)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkCitation)
  .use(remarkAutoReferences)
  .use(remarkHeadingAttributes)
  .use(remarkWikilink);

/** Re-parses a description detail's raw content with the full pipeline. */
const fragmentProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkCitation)
  .use(remarkAutoReferences)
  .use(remarkHeadingAttributes)
  .use(remarkWikilink);

export function parseMarkdown(markdown: string): Root {
  const prepared = equationsForParsers(
    calloutsForParsers(frontmatterForParsers(markdown))
  );
  const parserText = listCaptionsForParsers(prepared);
  const tree = parseProcessor.parse(parserText) as Root;
  const root = parseProcessor.runSync(tree, {
    value: parserText,
    data: { calloutSource: markdown }
  }) as Root;
  fixDescriptionPositions(root, markdown);
  restoreBareMarkers(root, markdown);
  restoreEmptyItems(root, markdown);
  restoreSpacedDestinations(root, markdown);
  restoreFigures(root, markdown);
  restoreListings(root, markdown);
  restoreTableCaptions(root, markdown);
  restoreListCaptions(root, markdown);
  return root;
}

interface CaptionView {
  text: string;
  toView(offset: number): number;
  toOriginal(offset: number): number;
}

/**
 * A callout body with its outer quote carriers removed but every source
 * boundary retained. Caption readers understand the body's Markdown, while
 * their answers still map back to the document's original positions.
 */
function captionView(
  markdown: string,
  callout: CalloutSource | null
): CaptionView {
  if (callout === null) {
    return {
      text: markdown,
      toView: (offset) => offset,
      toOriginal: (offset) => offset
    };
  }

  const originalToView = new Array<number>(markdown.length + 1);
  const viewToOriginal: number[] = [0];
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  for (;;) {
    const newline = markdown.indexOf('\n', start);
    const end = newline < 0 ? markdown.length : newline;
    lines.push({ start, end, text: markdown.slice(start, end) });
    if (newline < 0) {
      break;
    }
    start = newline + 1;
  }

  const hidden = new Set<number>();
  for (const line of lines) {
    if (line.start < callout.from || line.start >= callout.to) {
      continue;
    }
    const prefix = /^ {0,3}(?:> ?)+/.exec(line.text)?.[0].length ?? 0;
    for (let offset = line.start; offset < line.start + prefix; offset += 1) {
      hidden.add(offset);
    }
  }

  let text = '';
  for (let offset = 0; offset < markdown.length; offset += 1) {
    originalToView[offset] = text.length;
    if (hidden.has(offset)) {
      continue;
    }
    viewToOriginal[text.length] = offset;
    text += markdown[offset];
  }
  originalToView[markdown.length] = text.length;
  viewToOriginal[text.length] = markdown.length;

  return {
    text,
    toView: (offset) => originalToView[Math.max(0, Math.min(offset, markdown.length))],
    toOriginal: (offset) => viewToOriginal[Math.max(0, Math.min(offset, text.length))]
  };
}

/** One caption's source ranges moved from a callout body view to the document. */
function mapCaptionData(data: CaptionLineData, view: CaptionView): CaptionLineData {
  return {
    ...data,
    source: view.text.slice(data.captionFrom, data.captionTo),
    captionFrom: view.toOriginal(data.captionFrom),
    captionTo: view.toOriginal(data.captionTo),
    textFrom: view.toOriginal(data.textFrom),
    textTo: view.toOriginal(data.textTo),
    attribute:
      data.attribute === null
        ? null
        : {
            ...data.attribute,
            from: view.toOriginal(data.attribute.from),
            to: view.toOriginal(data.attribute.to),
            separatorFrom: view.toOriginal(data.attribute.separatorFrom)
          }
  };
}

/**
 * Attaches a following caption line to a parsed GFM table.
 *
 * Remark reads a directly adjacent `: caption` as one more table row. A caption
 * after one blank line becomes a paragraph. Both are repaired here from the raw
 * source. Two blank lines leave the colon line ordinary Markdown.
 */
function restoreTableCaptions(tree: Root, markdown: string): void {
  const definitions = footnoteLabels(markdown);
  visit(tree.children, null);

  function visit(children: RootContent[], callout: CalloutSource | null): void {
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index] as RootContent & {
        type: string;
        callout?: CalloutSource;
        children?: RootContent[];
        position?: NodePosition;
      };
      const context =
        child.type === 'callout' && child.callout !== undefined
          ? child.callout
          : callout;
      if (child.type === 'table') {
        attachCaption(children, index, child, definitions, context);
      }
      if (Array.isArray(child.children)) {
        visit(child.children, context);
      }
    }
  }

  function attachCaption(
    children: RootContent[],
    index: number,
    table: RootContent & {
      children?: RootContent[];
      position?: NodePosition;
      source?: string;
      tableCaption?: TableCaptionNode;
    },
    labels: ReadonlySet<string>,
    callout: CalloutSource | null
  ): void {
    const start = table.position?.start.offset;
    const end = table.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    const view = captionView(markdown, callout);
    const viewStart = view.toView(start);
    const attachment = tableCaptionAfterTable(view.text, viewStart);
    if (attachment === null) {
      table.source = view.text.slice(viewStart, view.toView(end));
      return;
    }
    const source = readTableSource(view.text.slice(viewStart));
    if (source === null || !Array.isArray(table.children)) {
      table.source = view.text.slice(viewStart, view.toView(end));
      return;
    }
    const tableEnd = view.toOriginal(attachment.caption.captionTo);
    const captionData = mapCaptionData(attachment.caption, view);
    table.children.splice(source.rows.length);
    table.position = {
      start: { offset: start },
      end: { offset: tableEnd }
    };
    table.source = view.text.slice(viewStart, attachment.caption.captionTo);
    table.tableCaption = {
      type: 'tableCaption',
      ...attachedCaptionFields(
        captionData,
        attachment.separatorFrom !== null,
        attachment.separatorFrom === null
          ? null
          : view.toOriginal(attachment.separatorFrom),
        labels
      ),
      tableFrom: view.toOriginal(attachment.tableFrom)
    };
    let next = index + 1;
    while (next < children.length) {
      const position = (children[next] as { position?: NodePosition }).position;
      if (
        position === undefined ||
        position.start.offset < captionData.captionFrom ||
        position.end.offset > captionData.captionTo
      ) {
        break;
      }
      children.splice(next, 1);
    }
  }
}

/** Attaches a following colon caption to each top-level Markdown list. */
function restoreListCaptions(tree: Root, markdown: string): void {
  const definitions = footnoteLabels(markdown);
  visit(tree.children, null);

  function visit(children: RootContent[], callout: CalloutSource | null): void {
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index] as RootContent & {
        type: string;
        callout?: CalloutSource;
        source?: string;
        listCaption?: ListCaptionNode;
        children?: RootContent[];
        position?: NodePosition;
      };
      const context =
        child.type === 'callout' && child.callout !== undefined
          ? child.callout
          : callout;
      if (child.type === 'list') {
        attachCaption(children, index, child, context);
      }
      if (Array.isArray(child.children)) {
        visit(child.children, context);
      }
    }
  }

  function attachCaption(
    children: RootContent[],
    index: number,
    list: RootContent & {
      source?: string;
      listCaption?: ListCaptionNode;
      position?: NodePosition;
    },
    callout: CalloutSource | null
  ): void {
    const start = list.position?.start.offset;
    const end = list.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    const view = captionView(markdown, callout);
    const viewStart = view.toView(start);
    const attachment = listCaptionAfterList(
      view.text,
      viewStart,
      view.toView(end)
    );
    if (attachment === null) {
      return;
    }
    const captionData = mapCaptionData(attachment.caption, view);
    list.position = {
      start: pointAt(markdown, start),
      end: pointAt(markdown, captionData.captionTo)
    };
    list.source = view.text.slice(viewStart, attachment.caption.captionTo);
    list.listCaption = {
      type: 'listCaption',
      ...attachedCaptionFields(
        captionData,
        attachment.separatorFrom !== null,
        attachment.separatorFrom === null
          ? null
          : view.toOriginal(attachment.separatorFrom),
        definitions
      ),
      listFrom: start
    };
    let next = index + 1;
    while (next < children.length) {
      const position = (children[next] as { position?: NodePosition }).position;
      if (
        position === undefined ||
        position.start.offset < captionData.captionFrom ||
        position.end.offset > captionData.captionTo
      ) {
        break;
      }
      children.splice(next, 1);
    }
  }
}

/** The parser data shared by a table or list caption, after its inline Markdown is parsed. */
function attachedCaptionFields(
  data: CaptionLineData,
  separated: boolean,
  separatorFrom: number | null,
  definitions: ReadonlySet<string>
): {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  children: RootContent[];
  source: string;
  captionData: CaptionLineData;
  separatorFrom: number | null;
  separated: boolean;
  position: {
    start: { offset: number };
    end: { offset: number };
  };
} {
  return {
    id: data.id,
    classes: data.classes,
    attributes: data.attributes,
    children: captionChildren(data, definitions),
    source: data.source,
    captionData: data,
    separatorFrom,
    separated,
    position: {
      start: { offset: data.captionFrom },
      end: { offset: data.captionTo }
    }
  };
}

/** Parse a caption's inline Markdown and move its offsets into the block source. */
function captionChildren(
  data: CaptionLineData,
  definitions: ReadonlySet<string>
): RootContent[] {
  const withContext = withFootnoteDefinitions(data.caption, definitions);
  const parsed = fragmentProcessor.runSync(
    fragmentProcessor.parse(withContext),
    withContext
  ) as Root;
  const caption = parsed.children
    .filter((child) => isOwnNode(child, data.caption.length))
    .flatMap((child) =>
      child.type === 'paragraph' ? (child.children ?? []) : [child]
    ) as RootContent[];
  for (const child of caption) {
    walk(child, (node) => {
      const position = (node as { position?: NodePosition }).position;
      if (position) {
        position.start.offset += data.textFrom;
        position.end.offset += data.textFrom;
      }
    });
  }
  return caption;
}

/** One source point, including the line and column mdast positions require. */
function pointAt(markdown: string, offset: number): {
  line: number;
  column: number;
  offset: number;
} {
  const before = markdown.slice(0, offset);
  const line = 1 + (before.match(/\n/g)?.length ?? 0);
  const lastBreak = markdown.lastIndexOf('\n', Math.max(0, offset - 1));
  return { line, column: offset - lastBreak, offset };
}

/**
 * remark-deflist serializes deflist paragraphs with a CommonMark-only `toMarkdown`,
 * and everything the editor's pipeline adds to a line is a node that writer does not
 * know: it throws on GFM's `delete`, on a citation, a wikilink, inline math and a
 * footnote reference (all of them parsed before deflist runs, because they are
 * micromark constructs rather than transformers).
 *
 * So a description list holding any of them is rewritten as its own text first, and
 * the terms and details are re-parsed with the full pipeline afterwards
 * ({@link fixDescriptionPositions}), where the nodes come back.
 */
function remarkDeflistCompat() {
  return (tree: Root): void => {
    walk(tree, (node) => {
      if (node.type !== 'paragraph') {
        return;
      }
      const text = stringifyMarkdownNode(node);
      if (!/^:\s/.test(text) && !/\n:\s/.test(text)) {
        return;
      }
      flattenUnwritableNodes(node);
    });
  };
}

/**
 * remark-deflist rebuilds description lists by re-parsing their fragments with plain
 * CommonMark, so the term/details nodes have no positions, their descendants carry
 * 0-based fragment-relative ones, and the constructs the editor adds are dropped (or,
 * with `remarkDeflistCompat`, flattened to text). Reconstruct each element's span
 * against the source document and re-parse the terms' and details' raw content with the
 * full pipeline, so rendering and offset mapping see correct absolute positions like
 * every other node.
 */
function fixDescriptionPositions(tree: Root, markdown: string): void {
  // A term or a detail is re-parsed from its own line, which is a fragment: the
  // definitions its references need are borrowed here, exactly as a whole block borrows
  // them (`footnotes.ts`), so the borrow is read once for the whole document.
  const definitions = footnoteLabels(markdown);
  /** Visits every child list of `children`, which are one parent's. */
  const visit = (children: RootContent[]): void => {
    children.forEach((child, index) => {
      const node = child as RootContent & { children?: RootContent[]; position?: NodePosition };
      if (Array.isArray(node.children)) {
        visit(node.children);
      }
      if (node.type !== 'descriptionlist' || !node.children) {
        return;
      }
      const terms = node.children.filter((entry) => entry.type === 'descriptionterm');
      const details = node.children.filter((entry) => entry.type === 'descriptiondetails');
      if (terms.length === 0) {
        return;
      }
      // The plugin swaps the paragraphs it rewrote for the list, so the list covers the
      // gap between its neighbours — one paragraph (`term\n: detail`) or two, split by a
      // blank line (`term\n\n: detail`), with every gap between them inside it. Matching
      // a *serialized* term against the source is what this used to do, and it is lossy
      // in the way the crash above was: the writer drops what a reader cannot see, so
      // `&amp;` comes back as `&`, the line was not found, and the whole repair silently
      // gave up — leaving every node in the list with fragment-relative offsets.
      const lines = readDescriptionLines(
        markdown,
        positionEnd(children.slice(0, index)),
        positionStart(children.slice(index + 1)),
        terms.length,
        details.length
      );
      if (!lines) {
        return;
      }
      let termIndex = 0;
      let detailIndex = 0;
      for (const line of lines) {
        const sourceLine = markdown.slice(line.start, line.end);
        if (line.kind === 'detail') {
          const detail = details[detailIndex++];
          if (detail) {
            const content = sourceLine.replace(/^:\s+/, '');
            (detail as { position?: unknown }).position = {
              start: { offset: line.start },
              end: { offset: line.end }
            };
            reparseDescriptionContent(
              detail,
              content,
              line.start + sourceLine.length - content.length,
              definitions
            );
          }
        } else if (line.kind === 'term') {
          const term = terms[termIndex++];
          if (term) {
            (term as { position?: unknown }).position = {
              start: { offset: line.start },
              end: { offset: line.end }
            };
            // Only the indentation is dropped: the term's trailing spaces are kept (as
            // the non-breaking spaces `trailing_spaces.ts` writes) so a space typed at
            // the end of a term stays visible and editable.
            const content = sourceLine.trimStart();
            reparseDescriptionContent(
              term,
              content,
              line.start + sourceLine.length - content.length,
              definitions
            );
          }
        }
      }
      node.position = {
        start: { offset: lines[0].start },
        end: { offset: lines[lines.length - 1].end }
      };
    });
  };
  visit(tree.children);
}

interface NodePosition {
  start: { offset: number };
  end: { offset: number };
}

/** Where the last positioned sibling ends, or the document's start. */
function positionEnd(siblings: RootContent[]): number {
  for (let index = siblings.length - 1; index >= 0; index -= 1) {
    const position = (siblings[index] as { position?: NodePosition }).position;
    if (position) {
      return position.end.offset;
    }
  }
  return 0;
}

/** Where the next positioned sibling starts, or the document's end. */
function positionStart(siblings: RootContent[]): number {
  for (const sibling of siblings) {
    const position = (sibling as { position?: NodePosition }).position;
    if (position) {
      return position.start.offset;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * The lines a description list of these counts covers between two offsets: from the
 * first non-blank line to the line that completes the counts, or null when they do not
 * complete. A `: ` line is the next detail and any other line is the next term; blank
 * lines are the paragraph break the two-line form is written with, so they are the
 * list's but not one of its parts.
 */
function readDescriptionLines(
  markdown: string,
  from: number,
  to: number,
  terms: number,
  details: number
): { start: number; end: number; kind: 'term' | 'detail' | 'ignored' }[] | null {
  const lines: { start: number; end: number; kind: 'term' | 'detail' | 'ignored' }[] = [];
  let termCount = 0;
  let detailCount = 0;
  let lineStart = Math.max(0, Math.min(from, markdown.length));
  const limit = Math.max(lineStart, Math.min(to, markdown.length));
  while (lineStart < limit) {
    const newline = markdown.indexOf('\n', lineStart);
    const lineEnd = newline < 0 || newline > limit ? limit : newline;
    const line = markdown.slice(lineStart, lineEnd);
    if (line.trim() !== '') {
      if (/^:\s+/.test(line) && detailCount < details) {
        detailCount += 1;
        lines.push({ start: lineStart, end: lineEnd, kind: 'detail' });
      } else if (termCount < terms) {
        termCount += 1;
        lines.push({ start: lineStart, end: lineEnd, kind: 'term' });
      } else {
        // A line the list's own node does not name — the rest of a detail that runs on,
        // or a term the plugin left out. The list's span keeps it: the line is inside
        // the gap the list covers, and dropping it would move every span after it.
        lines.push({ start: lineStart, end: lineEnd, kind: 'ignored' });
      }
    }
    if (newline < 0 || newline >= limit) {
      break;
    }
    lineStart = newline + 1;
  }
  return termCount === terms && detailCount === details ? lines : null;
}

/**
 * Replaces a term/details element's children with the full-pipeline parse of its raw
 * content, shifting the fragment-relative positions to absolute.
 *
 * A fragment is a parse with no document around it, and markdown reads `[^1]` as a
 * footnote reference only when its definition is in the same parse — so the fragment
 * borrows the definitions the document holds, the way a block does (`footnotes.ts`), and
 * the nodes that come from the borrowed lines are dropped again: they belong to the
 * document, not to the term or the detail.
 */
function reparseDescriptionContent(
  element: RootContent & { children: RootContent[] },
  source: string,
  absoluteStart: number,
  definitions: ReadonlySet<string>
): void {
  const withContext = withFootnoteDefinitions(source, definitions);
  const root = fragmentProcessor.runSync(fragmentProcessor.parse(withContext), withContext) as Root;
  const children = root.children
    .filter((child) => isOwnNode(child, source.length))
    .flatMap((child) => (child.type === 'paragraph' ? (child.children ?? []) : [child]));
  for (const child of children) {
    walk(child, (desc) => {
      const position = (
        desc as { position?: { start: { offset: number }; end: { offset: number } } }
      ).position;
      if (position) {
        position.start.offset += absoluteStart;
        position.end.offset += absoluteStart;
      }
    });
  }
  element.children = children;
}

/** Depth-first walk over a tree node and its descendants. */
function walk(node: unknown, callback: (node: any) => void): void {
  callback(node);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      walk(child, callback);
    }
  }
}

