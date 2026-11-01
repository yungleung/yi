/**
 * Inline Markdown as the HTML a common Markdown reader can display.
 *
 * Table and list fallbacks share this renderer so inline formatting, links,
 * pictures, code, math, and line breaks have one portable representation.
 *
 * May import: the shared HTML escaping rule. Upholds: every source character is
 * escaped unless it is one of the small, fixed inline elements below.
 */

import type { RootContent } from 'mdast';
import { escapeHtml } from './html';

interface InlineNode {
  type: string;
  value?: unknown;
  url?: unknown;
  title?: unknown;
  alt?: unknown;
  children?: InlineNode[];
}

/** Inline Markdown nodes as HTML. */
export function inlineHtml(nodes: readonly RootContent[] | readonly InlineNode[]): string {
  return (nodes as readonly InlineNode[]).map(inlineNodeHtml).join('');
}

/** One inline node as escaped text and the standard inline HTML elements. */
function inlineNodeHtml(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(String(node.value ?? ''));
    case 'inlineCode':
      return `<code>${escapeHtml(String(node.value ?? ''))}</code>`;
    case 'strong':
      return `<strong>${inlineHtml(node.children ?? [])}</strong>`;
    case 'emphasis':
      return `<em>${inlineHtml(node.children ?? [])}</em>`;
    case 'delete':
      return `<del>${inlineHtml(node.children ?? [])}</del>`;
    case 'link':
      return `<a href="${escapeHtml(String(node.url ?? ''))}"${titleAttribute(node)}>` +
        `${inlineHtml(node.children ?? [])}</a>`;
    case 'image': {
      const alt = escapeHtml(String(node.alt ?? ''));
      return `<img src="${escapeHtml(String(node.url ?? ''))}" alt="${alt}"${titleAttribute(node)}>`;
    }
    case 'break':
      return '<br>';
    case 'html':
      return String(node.value ?? '');
    case 'inlineMath':
      return `<span class="math inline">${escapeHtml(String(node.value ?? ''))}</span>`;
    default:
      return node.children === undefined
        ? escapeHtml(String(node.value ?? ''))
        : inlineHtml(node.children);
  }
}

/** A link or image title, when one was written. */
function titleAttribute(node: InlineNode): string {
  return node.title == null ? '' : ` title="${escapeHtml(String(node.title))}"`;
}
