/**
 * One captioned list as processed-Markdown HTML.
 *
 * The list keeps its ordered start, task boxes, nested lists, and inline
 * content. Yi adds the target wrapper and the generated numbered caption so a
 * common Markdown reader sees the same list object as the Pandoc writers.
 *
 * May import: the AST vocabulary, caption metadata, inline HTML renderer, and
 * shared HTML escaping. Upholds: IDs, classes, key/value attributes, list
 * structure, and caption text survive without exposing the colon syntax.
 */

import type { List, ListItem, RootContent } from 'mdast';
import type { ListCaptionNode } from '../markdown/syntax/list_captions';
import { escapeHtml, htmlAttributeName } from './html';
import { inlineHtml } from './inline_html';

interface CaptionedList extends List {
  listCaption?: ListCaptionNode;
}

/** Render one captioned list, including its visible numbered caption, as HTML. */
export function listHtml(list: CaptionedList, label: string): string {
  const caption = list.listCaption;
  if (caption === undefined) {
    return '';
  }
  const attributes = wrapperAttributes(caption);
  return [
    `<div${attributes}>`,
    listNodeHtml(list, '  '),
    `  <div class="list-caption"><span class="list-label">${escapeHtml(label)}.</span>${visibleCaption(caption)}</div>`,
    '</div>'
  ].join('\n');
}

/** The target and presentation attributes carried by the wrapper. */
function wrapperAttributes(caption: ListCaptionNode): string {
  const classes = ['list-target', ...caption.classes];
  const attributes = [
    ...(caption.id === null ? [] : [`id="${escapeHtml(caption.id)}"`]),
    `class="${escapeHtml(classes.join(' '))}"`,
    ...Object.entries(caption.attributes).map(
      ([key, value]) => `data-${htmlAttributeName(key)}="${escapeHtml(value)}"`
    )
  ];
  return ` ${attributes.join(' ')}`;
}

/** One ordered or bullet list, recursively including nested lists. */
function listNodeHtml(list: List, indent: string): string {
  const tag = list.ordered ? 'ol' : 'ul';
  const start =
    list.ordered && list.start != null && list.start !== 1
      ? ` start="${list.start}"`
      : '';
  return [
    `${indent}<${tag}${start}>`,
    ...list.children.map((item) => itemHtml(item, `${indent}  `)),
    `${indent}</${tag}>`
  ].join('\n');
}

/** One list item, including a task box and any nested lists. */
function itemHtml(item: ListItem, indent: string): string {
  const checked = item.checked ?? null;
  const paragraphs = item.children.filter(
    (child): child is Extract<RootContent, { type: 'paragraph' }> =>
      child.type === 'paragraph'
  );
  const nested = item.children.filter((child): child is List => child.type === 'list');
  const content = paragraphs.map((paragraph) => inlineHtml(paragraph.children)).join('<br>');
  const box =
    checked === null
      ? ''
      : `<input type="checkbox" disabled${checked ? ' checked' : ''}> `;
  const itemClass = checked === null ? '' : ' class="task-list-item"';
  const lines = [`${indent}<li${itemClass}>${box}${content}`];
  for (const child of nested) {
    lines.push(listNodeHtml(child, `${indent}  `));
  }
  lines[lines.length - 1] += '</li>';
  return lines.join('\n');
}

/** The space and caption Markdown following the generated label. */
function visibleCaption(caption: ListCaptionNode): string {
  const text = inlineHtml(caption.children);
  return text === '' ? '' : ` ${text}`;
}
