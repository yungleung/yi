/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 * The virtual renderer composes these individual block elements.
 *
 * May import: the document's blocks, the node registry, the caret, `source_mode/`, the focused
 * block's text and the three highlighters. Upholds: a block's rendering is a pure function of its
 * own source — the component is built from the block's slice, and the block's line range is tagged
 * on it for everything that maps back.
 */

import { hasBodyView, type BlockNode } from './document/block';
import type { RootContent } from 'mdast';
import { appendChildren } from './registry';
import { isSourceBlock, withRenderFrame } from './source_mode';
import { showCaret } from './caret/caret';
import { Caption } from './nodes/caption';
import { readCallout } from './syntax/callout';
import { CHAR_START, LINE_END, LINE_START, TEXT_FROM, setOffset } from './offset_tags';
import { renderEquationBlock } from './block_views/equation';
import { renderFenceBody } from './block_views/fence';
import { renderSourceBlock } from './block_views/source';
// Importing the registration bootstrap registers every node component.
import './create_node';

export interface BlockComponent {
  readonly type: 'block';
  readonly node: BlockNode;
  readonly element: HTMLElement;
}

/**
 * Creates a block component from the block's parsed children. Parsing happens
 * in the editor state, which is the single place that knows how a block's
 * source is prepared for the renderer.
 */
export function createBlockComponent(node: BlockNode, children: RootContent[]): BlockComponent {
  return new BlockView(node, children);
}

/** A single block: a line-tagged container holding the block's content. */
class BlockView implements BlockComponent {
  readonly type = 'block' as const;
  readonly node: BlockNode;
  readonly element: HTMLElement;

  constructor(node: BlockNode, children: RootContent[]) {
    this.node = node;
    const callout = readCallout(node.text);
    const theorem = containsTheorem(children);
    // The block is built with itself named as the one being built, so a node
    // inside it can tell whether its own source is the one being shown (see
    // `source_mode/`).
    this.element = withRenderFrame(node, () =>
      node.kind === 'blank'
        ? this.renderBlank(node)
        : node.kind === 'equation'
          ? renderEquationBlock(node, (block) => this.container(block), (block, children, callout) =>
              this.renderParsed(block, children, callout)
            )
        : isSourceBlock(node, theorem)
          ? renderSourceBlock(node, callout, (block) => this.container(block))
          : hasBodyView(node.kind)
            ? renderFenceBody(node, (block) => this.container(block))
            : this.renderParsed(node, children, callout)
    );
  }

  /** A blank line the author added: an empty paragraph holding the caret. */
  private renderBlank(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.classList.add('markdown-blank');
    const paragraph = document.createElement('p');
    paragraph.className = 'markdown-node markdown-empty-line';
    const placeholder = document.createElement('span');
    placeholder.className = 'markdown-empty-line-placeholder markdown-node';
    // Block-relative: an empty paragraph starts at its own line start. The node it holds is
    // *empty*: a blank line has no character of its own — the space it used to hold was a
    // placeholder only the caret could see, and a character that is not the author's is one the
    // reader could select and copy. What gives the line a box is the paragraph (`styles.css`) and
    // what gives the caret a place is `caret/geometry.ts: lineBoxAround` (see also `nodes/list.ts`
    // and `nodes/table.ts`, which hold the same empty node for an empty item and cell).
    setOffset(placeholder, TEXT_FROM, 0);
    placeholder.appendChild(document.createTextNode(''));
    paragraph.appendChild(placeholder);
    element.appendChild(paragraph);
    // An empty paragraph holds no characters to aim at, so every click on it
    // puts the caret at the start of the line it stands for.
    paragraph.addEventListener('click', (event) => {
      event.stopPropagation();
      const text = placeholder.firstChild;
      if (!text) {
        return;
      }
      const caret = document.createRange();
      caret.setStart(text, 0);
      caret.collapse(true);
      showCaret(caret);
      (element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
    });
    return element;
  }

  private renderParsed(
    node: BlockNode,
    children: RootContent[],
    callout: ReturnType<typeof readCallout>
  ): HTMLElement {
    const element = this.container(node);
    if (callout !== null) {
      element.classList.add('markdown-callout-block');
    }
    // The heading's level marker sits outside its own content box. The block owns that gutter so
    // content-visibility does not clip the marker or its hover target (`styles.css`).
    if (children.some((child) => child.type === 'heading')) {
      element.classList.add('markdown-heading-block');
    }
    appendChildren(element, children);
    const table = children.find((child) => child.type === 'table');
    const caption = table?.type === 'table' ? table.tableCaption : undefined;
    if (caption) {
      element.classList.add('markdown-table-block');
      if (caption.id !== null) {
        element.id = caption.id;
      }
      element.appendChild(new Caption(caption, 'table').element);
    }
    const list = children.find(
      (child) => child.type === 'list' && child.listCaption !== undefined
    );
    const listCaption = list?.type === 'list' ? list.listCaption : undefined;
    if (listCaption) {
      element.classList.add('markdown-list-block');
      if (listCaption.id !== null) {
        element.id = listCaption.id;
      }
      element.appendChild(new Caption(listCaption, 'list').element);
    }
    return element;
  }

  private container(node: BlockNode): HTMLElement {
    const element = document.createElement('div');
    element.className = 'markdown-block';
    setOffset(element, LINE_START, node.lineStart);
    setOffset(element, LINE_END, node.lineEnd);
    // The block's character start, refreshed on every render/edit. Revealed
    // source spans use it to tag block-relative positions.
    setOffset(element, CHAR_START, node.charStart);
    return element;
  }
}

/** Whether a parsed block contains a theorem at any nesting depth. */
function containsTheorem(children: RootContent[]): boolean {
  return children.some((child) =>
    child.type === 'theorem' ||
    containsTheorem(
      Array.isArray((child as { children?: RootContent[] }).children)
        ? (child as { children: RootContent[] }).children
        : []
    )
  );
}
