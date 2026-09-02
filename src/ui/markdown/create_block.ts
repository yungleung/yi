/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 * The virtual renderer composes these individual block elements.
 */

import type { BlockNode } from './blocks';
import type { RootContent } from 'mdast';
import { appendChildren } from './registry';
import { parseMarkdown } from './parser';
// Importing the registration bootstrap registers every node component.
import './create_node';

export interface BlockComponent {
  readonly type: 'block';
  readonly node: BlockNode;
  readonly element: HTMLElement;
}

/**
 * Creates a block component from cached AST children or, when absent, the
 * block's own raw slice.
 */
export function createBlockComponent(
  node: BlockNode,
  children?: RootContent[]
): BlockComponent {
  return new BlockView(node, children);
}

/** A single block: a line-tagged container holding the block's content. */
class BlockView implements BlockComponent {
  readonly type = 'block' as const;
  readonly node: BlockNode;
  readonly element: HTMLElement;

  constructor(node: BlockNode, children?: RootContent[]) {
    this.node = node;
    this.element =
      node.kind === 'frontmatter' ? this.renderFrontmatter(node) : this.renderParsed(node, children);
  }

  private renderParsed(node: BlockNode, children?: RootContent[]): HTMLElement {
    const content = children ?? parseMarkdown(node.text).children;
    const element = this.container(node);
    appendChildren(element, content);
    return element;
  }

  private renderFrontmatter(node: BlockNode): HTMLElement {
    const pre = this.container(node);
    pre.className += ' markdown-frontmatter';
    pre.textContent = node.text;
    return pre;
  }

  private container(node: BlockNode): HTMLElement {
    const element = document.createElement('div');
    element.className = 'markdown-block';
    element.dataset.lineStart = String(node.lineStart);
    element.dataset.lineEnd = String(node.lineEnd);
    // The block's character start, refreshed on every render/edit. Revealed
    // source spans use it to tag block-relative positions.
    element.dataset.charStart = String(node.charStart);
    return element;
  }
}
