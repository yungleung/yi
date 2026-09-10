import { createBlockComponent } from './create_block';
import type { BlockNode, MarkdownBlock } from './blocks';
import type { MarkdownEditorState, TextChange } from './state';

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
    const root = this.createRoot();
    this.scroller.replaceChildren(root);
    this.mountVisible();
  }

  renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    if (!block || !this.root) {
      return;
    }
    const element = this.createBlockElement(block);
    const current = this.root.querySelector<HTMLElement>(
      `.markdown-block[data-line-start="${lineStart}"]`
    );
    if (current) {
      current.replaceWith(element);
    }
  }

  renderChanged(change: TextChange): void {
    if (!this.root || !this.mountedRange) {
      this.render();
      return;
    }
    const oldElements = [...this.root.querySelectorAll<HTMLElement>('.markdown-block')];
    const oldElementByIndex = new Map<number, HTMLElement>();
    oldElements.forEach((element, index) => {
      oldElementByIndex.set(this.mountedRange!.first + index, element);
    });

    const itemSize = ESTIMATED_BLOCK_HEIGHT + BLOCK_GAP;
    const first = Math.min(
      change.newBlocks.length - 1,
      Math.floor(Math.max(0, this.scroller.scrollTop - VIEWPORT_MARGIN) / itemSize)
    );
    const last = Math.min(
      change.newBlocks.length - 1,
      Math.ceil(
        (this.scroller.scrollTop + this.scroller.clientHeight + VIEWPORT_MARGIN) / itemSize
      )
    );
    this.mountedRange = change.newBlocks.length === 0 ? null : { first, last };

    const topSpacer = this.root.querySelector<HTMLElement>('[data-virtual-spacer="top"]');
    const bottomSpacer = this.root.querySelector<HTMLElement>('[data-virtual-spacer="bottom"]');
    if (!topSpacer || !bottomSpacer || !this.mountedRange) {
      this.render();
      return;
    }
    topSpacer.style.height = `${first * itemSize}px`;
    bottomSpacer.style.height = `${Math.max(0, change.newBlocks.length - last - 1) * itemSize}px`;

    const nextElements: HTMLElement[] = [];
    for (let index = first; index <= last; index += 1) {
      const block = change.newBlocks[index];
      const oldIndex =
        index < change.newFrom
          ? index
          : index >= change.newTo
            ? index - (change.newTo - change.newFrom) + (change.oldTo - change.oldFrom)
            : -1;
      const existing = oldElementByIndex.get(oldIndex);
      if (existing && (index < change.newFrom || index >= change.newTo)) {
        this.updateBlockElement(existing, block);
        nextElements.push(existing);
      } else {
        nextElements.push(this.createBlockElement(block));
      }
    }

    const nextSet = new Set(nextElements);
    for (const element of oldElements) {
      if (!nextSet.has(element)) {
        element.remove();
      }
    }
    let cursor: ChildNode = bottomSpacer;
    for (let index = nextElements.length - 1; index >= 0; index -= 1) {
      const element = nextElements[index];
      cursor.before(element);
      cursor = element;
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

  revealOffset(offset: number): void {
    const blocks = this.state.getBlocks();
    const blockIndex = blocks.findIndex(
      (block) => offset >= block.charStart && offset <= block.charEnd
    );
    if (blockIndex < 0) {
      return;
    }
    const itemSize = ESTIMATED_BLOCK_HEIGHT + BLOCK_GAP;
    this.scroller.scrollTop = Math.max(0, blockIndex * itemSize - VIEWPORT_MARGIN / 2);
    this.mountVisible();
  }

  private createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full outline-none';
    root.tabIndex = 0;
    this.root = root;
    this.mountedRange = null;
    return root;
  }

  private createBlockElement(block: MarkdownBlock): HTMLElement {
    const node: BlockNode = { ...block, type: 'block' };
    return createBlockComponent(node, this.state.getBlockContent(block)).element;
  }

  private updateBlockElement(element: HTMLElement, block: MarkdownBlock): void {
    element.dataset.lineStart = String(block.lineStart);
    element.dataset.lineEnd = String(block.lineEnd);
    element.dataset.charStart = String(block.charStart);
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
