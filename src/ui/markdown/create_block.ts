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

import type { BlockNode, BlockRoot } from './blocks';
import type { Root, RootContent } from 'mdast';
import { appendChildren } from './create_node';
import { parseMarkdown } from './parser';

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
  return new RootBlockView(tree, sliceBlocks(tree, root));
}

/** Creates a standalone block component (parses the block's own slice). */
export function createBlockComponent(node: BlockNode): BlockComponent {
  return new BlockView(node);
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
    return element;
  }
}

/**
 * Assigns each node of the whole-document tree to the block whose line range
 * contains it. Both lists are in document order, so one pass suffices.
 */
function sliceBlocks(tree: BlockRoot, root: Root): Map<number, RootContent[]> {
  const blocks = tree.children;
  const slices = new Map<number, RootContent[]>();
  let index = 0;
  let lastEnd = -1;

  const push = (i: number, child: RootContent): void => {
    if (i >= blocks.length) {
      return;
    }
    const list = slices.get(i);
    if (list) {
      list.push(child);
    } else {
      slices.set(i, [child]);
    }
  };

  for (const child of root.children) {
    const position = (
      child as { position?: { start: { offset?: number }; end: { offset?: number } } }
    ).position;
    if (position?.start.offset !== undefined) {
      const start = position.start.offset;
      const end = position.end.offset ?? start;
      while (index < blocks.length && start > blocks[index].charEnd) {
        index += 1;
      }
      if (index >= blocks.length) {
        break;
      }
      if (start >= blocks[index].charStart) {
        push(index, child);
        lastEnd = Math.max(lastEnd, end);
      }
    } else {
      // Position-less constructs (description lists) belong to the block
      // that follows the previously assigned content.
      while (index < blocks.length && blocks[index].charStart <= lastEnd) {
        index += 1;
      }
      if (index >= blocks.length) {
        break;
      }
      push(index, child);
      lastEnd = Math.max(lastEnd, blocks[index].charEnd);
    }
  }
  return slices;
}
