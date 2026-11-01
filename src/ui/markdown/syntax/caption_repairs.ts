/**
 * Reattaches table and list captions after remark parses them as ordinary
 * children.
 *
 * Example: a list followed by `: Results` becomes one `list` node whose
 * `listCaption` points at the colon line; inside a callout its offsets still
 * name the same characters in the full document.
 *
 * May import: mdast, caption readers, footnote borrowing, the fragment remark
 * pipeline and the generic node walker. Upholds: every caption offset maps to
 * the original block source, including when quote carriers are hidden.
 */

import type { Root, RootContent } from 'mdast';
import type { CalloutSource } from './callout';
import type { CaptionLineData } from './caption_lines';
import { footnoteLabels, isOwnNode, withFootnoteDefinitions } from './footnote';
import {
  listCaptionAfterList,
  type ListCaptionNode
} from './list';
import { walk } from './node_walk';
import { fragmentProcessor } from './remark_pipeline';
import {
  readTableSource,
  tableCaptionAfterTable,
  type TableCaptionNode
} from './table';

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
export function restoreTableCaptions(tree: Root, markdown: string): void {
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
    removeCaptionChildren(children, index, captionData);
  }
}

/** Attaches a following colon caption to each top-level Markdown list. */
export function restoreListCaptions(tree: Root, markdown: string): void {
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
    removeCaptionChildren(children, index, captionData);
  }
}

/** Removes the parser's own nodes for source that now belongs to a caption. */
function removeCaptionChildren(
  children: RootContent[],
  index: number,
  caption: CaptionLineData
): void {
  let next = index + 1;
  while (next < children.length) {
    const position = (children[next] as { position?: NodePosition }).position;
    if (
      position === undefined ||
      position.start.offset < caption.captionFrom ||
      position.end.offset > caption.captionTo
    ) {
      break;
    }
    children.splice(next, 1);
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

interface NodePosition {
  start: { offset: number };
  end: { offset: number };
}
