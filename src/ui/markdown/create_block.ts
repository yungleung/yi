/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 * The virtual renderer composes these individual block elements.
 *
 * May import: the document's blocks, the node registry, the caret and
 * `source_mode.ts`. Upholds: a block's rendering is a pure function of its own
 * source — the component is built from the block's slice, and the block's line
 * range is tagged on it for everything that maps back.
 */

import type { BlockNode } from './document/blocks';
import type { RootContent } from 'mdast';
import { appendChildren } from './registry';
import { isSourceBlock, withRenderFrame } from './source_mode';
import { showCaret } from './caret/caret';
import { Frontmatter } from './nodes/frontmatter';
import { SourceText } from './nodes/source_text';
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
    // The block is built with itself named as the one being built, so a node
    // inside it can tell whether its own source is the one being shown (see
    // `source_mode.ts`).
    this.element = withRenderFrame(node, () =>
      node.kind === 'frontmatter'
        ? this.renderFrontmatter(node)
        : node.kind === 'blank'
          ? this.renderBlank(node)
          : isSourceBlock(node)
            ? this.renderSourceText(node)
            : this.renderParsed(node, children)
    );
  }

  /**
   * The block's own text, shown while the caret is inside it: the block is
   * built in whichever shape `source_mode.ts` names, and this is the one a
   * rendered view cannot hold a caret in.
   */
  private renderSourceText(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.appendChild(new SourceText(node).element);
    return element;
  }

  /** A blank line the author added: an empty paragraph holding the caret. */
  private renderBlank(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.classList.add('markdown-blank');
    const paragraph = document.createElement('p');
    paragraph.className = 'markdown-node markdown-empty-line';
    const placeholder = document.createElement('span');
    placeholder.className = 'markdown-empty-line-placeholder markdown-node';
    // Block-relative: an empty paragraph starts at its own line start.
    placeholder.dataset.textFrom = '0';
    placeholder.textContent = '\u00a0';
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

  private renderParsed(node: BlockNode, children: RootContent[]): HTMLElement {
    const element = this.container(node);
    appendChildren(element, children);
    return element;
  }

  private renderFrontmatter(node: BlockNode): HTMLElement {
    // The block is shown as its own source at all times, and it is a node like any other:
    // a click in it lands on the character clicked and a keystroke writes there (see
    // `nodes/frontmatter.ts`).
    const element = this.container(node);
    element.appendChild(new Frontmatter(node).element);
    return element;
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
