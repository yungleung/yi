/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 *
 * Renders an mdast-like block tree (see `buildBlockTree`): the root block
 * holds the whole document and its children are the document's blocks. The
 * root element deliberately carries no `.prose` class — the editor assigns
 * it, so the whole document renders as exactly one `.prose` element. Each
 * block renders its raw slice: frontmatter as source, every other kind
 * parsed with mdast and rendered with the usual node components.
 */

import { sliceBlockTree, type BlockNode, type BlockRoot } from './blocks';
import type { Root, RootContent } from 'mdast';
import { appendChildren } from './registry';
import { parseMarkdown } from './parser';
// Importing the registration bootstrap registers every node component.
import './create_node';

export interface BlockComponent {
  readonly type: 'root' | 'block';
  readonly node: BlockRoot | BlockNode;
  readonly element: HTMLElement;
}

/**
 * Creates the component for the whole document: the root block with each
 * block's content sliced from the already-parsed document tree. Slicing in
 * one ordered pass avoids re-parsing every block separately, which is the
 * dominant cost when rendering large documents.
 */
export function createDocumentView(tree: BlockRoot, root: Root): BlockComponent {
  return new RootBlockView(tree, sliceBlockTree(tree, root));
}

/**
 * Creates a standalone block component. When `children` are given (sliced
 * from the whole-document parse) they are used as-is; otherwise the block's
 * own slice is parsed.
 */
export function createBlockComponent(
  node: BlockNode,
  children?: RootContent[]
): BlockComponent {
  return new BlockView(node, children);
}

/** The document root block: a plain container for the document's blocks. */
class RootBlockView implements BlockComponent {
  readonly type = 'root' as const;
  readonly node: BlockRoot;
  readonly element: HTMLElement;

  constructor(node: BlockRoot, slices: Map<number, RootContent[]>) {
    this.node = node;
    this.element = document.createElement('div');
    node.children.forEach((block, index) => {
      this.element.appendChild(new BlockView(block, slices.get(index)).element);
    });
  }
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
