import { createBlockComponent } from './create_block';
import type { BlockNode } from './blocks';
import type { MarkdownEditorState } from './state';

const ESTIMATED_BLOCK_HEIGHT = 60;
const BLOCK_GAP = 16;
const VIEWPORT_MARGIN = 1200;

/**
 * Owns the DOM window for a block-based markdown document.
 *
 * The editor state remains the source of truth. This renderer only decides
 * which blocks need DOM nodes and maintains spacers for the unmounted ranges.
 */
export class VirtualBlockRenderer {
  private readonly scroller: HTMLElement;
  private readonly state: MarkdownEditorState;
  private root: HTMLElement | null = null;
  private frame: number | null = null;
  private mountedRange: { first: number; last: number } | null = null;

  constructor(scroller: HTMLElement, state: MarkdownEditorState) {
    this.scroller = scroller;
    this.state = state;
    scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
  }

  render(): void {
    const scrollTop = this.scroller.scrollTop;
    const root = this.createRoot();
    this.scroller.replaceChildren(root);
    this.scroller.scrollTop = scrollTop;
    this.mountVisible();
  }

  renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    if (!block || !this.root) {
      return;
    }
    const node: BlockNode = { ...block, type: 'block' };
    const element = createBlockComponent(node, this.state.getBlockContent(block)).element;
    const current = this.root.querySelector<HTMLElement>(
      `.markdown-block[data-line-start="${lineStart}"]`
    );
    if (current) {
      current.replaceWith(element);
    }
  }

  refreshBlockOffsets(): void {
    if (!this.root) {
      return;
    }
    const elements = new Map<number, HTMLElement>();
    for (const element of this.root.querySelectorAll<HTMLElement>('.markdown-block')) {
      const lineStart = Number(element.dataset.lineStart);
      if (Number.isFinite(lineStart)) {
        elements.set(lineStart, element);
      }
    }
    for (const block of this.state.getBlocks()) {
      elements.get(block.lineStart)?.setAttribute('data-char-start', String(block.charStart));
    }
  }

  private createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full outline-none';
    root.tabIndex = 0;
    this.root = root;
    this.mountedRange = null;
    return root;
  }

  private schedule(): void {
    if (this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.mountVisible();
    });
  }

  private mountVisible(): void {
    if (!this.root) {
      return;
    }
    const blocks = this.state.getBlocks();
    if (blocks.length === 0) {
      this.root.replaceChildren();
      return;
    }

    const itemSize = ESTIMATED_BLOCK_HEIGHT + BLOCK_GAP;
    const top = Math.max(0, this.scroller.scrollTop - VIEWPORT_MARGIN);
    const bottom = this.scroller.scrollTop + this.scroller.clientHeight + VIEWPORT_MARGIN;
    const first = Math.min(blocks.length - 1, Math.floor(top / itemSize));
    const last = Math.min(blocks.length - 1, Math.ceil(bottom / itemSize));
    if (this.mountedRange?.first === first && this.mountedRange.last === last) {
      return;
    }
    this.mountedRange = { first, last };

    const fragment = document.createDocumentFragment();
    fragment.appendChild(this.createSpacer(first * itemSize, 'top'));
    for (let index = first; index <= last; index += 1) {
      const block = blocks[index];
      const node: BlockNode = { ...block, type: 'block' };
      fragment.appendChild(createBlockComponent(node, this.state.getBlockContent(block)).element);
    }
    fragment.appendChild(
      this.createSpacer(Math.max(0, blocks.length - last - 1) * itemSize, 'bottom')
    );
    this.root.replaceChildren(fragment);
  }

  private createSpacer(height: number, position: 'top' | 'bottom'): HTMLElement {
    const spacer = document.createElement('div');
    spacer.dataset.virtualSpacer = position;
    spacer.style.height = `${height}px`;
    return spacer;
  }
}
