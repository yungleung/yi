/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 * The virtual renderer composes these individual block elements.
 *
 * May import: the document's blocks, the node registry, the caret, `source_mode.ts`, the fenced
 * block's body and the three highlighters. Upholds: a block's rendering is a pure function of its
 * own source — the component is built from the block's slice, and the block's line range is tagged
 * on it for everything that maps back.
 */

import type { BlockNode } from './document/blocks';
import type { RootContent } from 'mdast';
import { appendChildren } from './registry';
import { isSourceBlock, withRenderFrame } from './source_mode';
import { showCaret } from './caret/caret';
import { FenceBody } from './nodes/fence_body';
import { highlightCode } from './nodes/code_highlight';
import { highlightFrontmatter } from './nodes/frontmatter_highlight';
import { highlightLatex } from './nodes/latex_highlight';
import { fenceLanguage } from './syntax/markers';
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
      node.kind === 'frontmatter' || node.kind === 'fencedCode'
        ? this.renderFenceBody(node)
        : node.kind === 'blank'
          ? this.renderBlank(node)
          : isSourceBlock(node)
            ? this.renderSourceText(node)
            : this.renderParsed(node, children)
    );
  }

  /**
   * The block's own text, shown while the caret is inside it: the block is built in whichever shape
   * `source_mode.ts` names, and this is the one a rendered view cannot hold a caret in. A display
   * formula's text is its body, delimiters hidden, like the other two fenced blocks.
   */
  private renderSourceText(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.appendChild(
      new FenceBody(node, {
        className: 'markdown-source-text overflow-x-auto',
        language: 'latex',
        highlight: highlightLatex
      }).element
    );
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

  /**
   * A fenced block's body, its delimiters hidden: what a fenced code block and a frontmatter block
   * show at all times, and what a display formula shows while the caret is inside it.
   *
   * The body is the block's own characters — a node like any other, so a click lands on the
   * character clicked and a keystroke writes there — highlighted in the language the fence named,
   * or the block's own format, or LaTeX (see `nodes/fence_body.ts`).
   */
  private renderFenceBody(node: BlockNode): HTMLElement {
    const element = this.container(node);
    const fence = node.kind === 'frontmatter';
    const language = fence
      ? (node.format ?? 'yaml')
      : fenceLanguage(firstLine(node.text));
    element.appendChild(
      new FenceBody(node, {
        className: fence ? 'markdown-frontmatter overflow-x-auto' : 'markdown-fenced-code overflow-x-auto',
        language,
        highlight: fence
          ? (source: string) => highlightFrontmatter(source, node.format ?? 'yaml')
          : (source: string) => highlightCode(source, language)
      }).element
    );
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

/** A block's first line, where a fence names its language. */
function firstLine(text: string): string {
  const breakAt = text.indexOf('\n');
  return breakAt < 0 ? text : text.slice(0, breakAt);
}
