/**
 * Lowers captioned lists for each export kind.
 *
 * HTML, EPUB, DOCX, and ODT share one target wrapper and visible caption.
 * Processed Markdown uses semantic HTML; LaTeX/PDF use the namespaced list
 * counter through native labels and references.
 *
 * May import: the parse walk, reference index, caption metadata, and list HTML
 * renderer. Upholds: ordinary lists remain byte-for-byte unchanged and each
 * captioned list becomes one target.
 */

import type { List } from 'mdast';
import { referenceLabel, type ReferenceEntry } from '../../markdown/document/reference_index';
import type { ListCaptionNode } from '../../markdown/syntax/list';
import { spansOfType, type Walkable } from '../node_spans';
import { listHtml } from './list_html';
import { isLatexKind } from '../kind_family';

/** One source range and its replacement. */
export interface ListRewrite {
  start: number;
  end: number;
  text: string;
}

interface CaptionedList extends List {
  source?: string;
  listCaption?: ListCaptionNode;
}

/** Every rewrite captioned lists need for one export kind. */
export function listRewrites(
  tree: Walkable,
  references: readonly ReferenceEntry[],
  kind: string
): ListRewrite[] {
  const rewrites: ListRewrite[] = [];
  for (const span of spansOfType(tree, 'list')) {
    const list = span.node as unknown as CaptionedList;
    const caption = list.listCaption;
    if (caption === undefined || list.source === undefined) {
      continue;
    }
    const entry = references.find(
      (candidate) => candidate.kind === 'list' && candidate.from === span.start
    );
    if (entry === undefined) {
      continue;
    }
    if (kind === 'markdown') {
      rewrites.push({ start: span.start, end: span.end, text: listHtml(list, referenceLabel(entry)) });
      continue;
    }
    if (isLatexKind(kind)) {
      rewrites.push({
        start: span.start,
        end: span.end,
        text: latexList(list, caption)
      });
      continue;
    }
    rewrites.push({
      start: span.start,
      end: span.end,
      text: wrappedList(list, caption, referenceLabel(entry))
    });
  }
  return rewrites;
}

/** One LaTeX list target and caption while preserving Markdown caption content. */
function latexList(
  list: CaptionedList,
  caption: ListCaptionNode
): string {
  const bodyEnd = caption.captionData.captionFrom - (list.position?.start.offset ?? 0);
  const body = String(list.source ?? '').slice(0, bodyEnd).trimEnd();
  const tokens = [
    '.list-layout',
    ...caption.classes.map((name) => `.${name}`),
    ...Object.entries(caption.attributes).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
  const labelCommand =
    caption.id === null ? '' : `\\label{${latexLabel(caption.id)}}`;
  const raw =
    `\\phantomsection\\refstepcounter{yilist}${labelCommand}` +
    `\\noindent\\textbf{\\yiListName~\\theyilist.}`;
  const text = caption.captionData.caption;
  return [
    `::: {${tokens.join(' ')}}`,
    body,
    '',
    `\`${raw}\`{=latex}${text === '' ? '' : ` ${text}`}`,
    ':::'
  ].join('\n');
}

/** One shared non-LaTeX list wrapper and visible caption. */
function wrappedList(
  list: CaptionedList,
  caption: ListCaptionNode,
  label: string
): string {
  const bodyEnd = caption.captionData.captionFrom - (list.position?.start.offset ?? 0);
  const body = String(list.source ?? '').slice(0, bodyEnd).trimEnd();
  const tokens = [
    ...(caption.id === null ? [] : [`#${caption.id}`]),
    '.list-target',
    ...caption.classes.map((name) => `.${name}`),
    ...Object.entries(caption.attributes).map(
      ([key, value]) => `${key}="${attributeValue(value)}"`
    )
  ];
  const text = caption.captionData.caption;
  return [
    `:::: {${tokens.join(' ')}}`,
    body,
    '',
    '::: {.list-caption}',
    `**${markdownText(label)}.**${text === '' ? '' : ` ${text}`}`,
    ':::',
    '::::'
  ].join('\n');
}

/** Literal configured text inside Markdown emphasis. */
function markdownText(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, '\\$&');
}

/** One identifier used as a LaTeX label argument. */
function latexLabel(id: string): string {
  return id.replace(/\\/g, '\\textbackslash{}').replace(/}/g, '\\}');
}

/** A quoted Pandoc attribute value. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
