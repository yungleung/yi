/**
 * Creates and reconciles the prose root and block elements for virtual rendering.
 *
 * Example: when a window changes from blocks 4–8 to 5–9, reconciliation moves
 * the existing 5–8 elements and creates only block 9.
 *
 * May import: the block factory, cache, measurements and render context. Upholds:
 * only renderer-owned nodes are removed, and DOM reuse follows the content cache.
 */

import type { BlockNode, MarkdownBlock } from './document/blocks';
import type { MarkdownEditorState } from './document/state';
import { createBlockComponent } from './create_block';
import { withRenderContext, type RenderContext } from './render_context';
import type { RendererBlockCache } from './renderer_block_cache';
import type { RendererMeasurements } from './renderer_measurements';

/** What DOM construction needs from the virtual renderer. */
export interface RendererDomDependencies {
  readonly state: MarkdownEditorState;
  readonly cache: RendererBlockCache;
  readonly measurements: RendererMeasurements;
  readonly keyOf: (block: MarkdownBlock) => string;
  readonly renderContext: () => RenderContext | null;
}

/** Creates block DOM and reconciles the renderer-owned children of the prose root. */
export class RendererDom {
  constructor(private readonly renderer: RendererDomDependencies) {}

  /** Creates a fresh prose root for one rendered document. */
  createRoot(): HTMLElement {
    const root = document.createElement('div');
    // The page carries its own line height (`styles.css: .prose.markdown-page`),
    // scaled with the rest of its rhythm, so fixed leading is not wanted here.
    root.className = 'prose prose-slate prose-tight markdown-page outline-none';
    root.tabIndex = 0;
    return root;
  }

  /**
   * Reorders/inserts only what changed, preserving untouched caret anchors.
   *
   * Example: an unchanged block remains the same node while the window grows
   * around it; only new nodes are inserted.
   */
  reconcile(root: HTMLElement, desired: Node[]): void {
    let cursor = root.firstChild;
    for (const node of desired) {
      if (node === cursor) {
        cursor = cursor.nextSibling;
        continue;
      }
      root.insertBefore(node, cursor);
    }
    const keep = new Set(desired);
    while (cursor) {
      const next = cursor.nextSibling;
      if (!keep.has(cursor) && isRendererOwned(cursor)) {
        cursor.remove();
      }
      cursor = next;
    }
  }

  /** Reuses or builds the element for one markdown block. */
  createBlock(block: MarkdownBlock): HTMLElement {
    const key = this.renderer.keyOf(block);
    const spare = this.renderer.cache.takeSpare(key);
    if (spare) {
      this.renderer.measurements.setIntrinsicSize(
        spare,
        this.renderer.measurements.sizes.heightOf(block)
      );
      this.renderer.measurements.markPending(spare);
      return spare;
    }

    const node: BlockNode = { ...block, type: 'block' };
    const element = withRenderContext(this.renderer.renderContext(), () =>
      createBlockComponent(
        node,
        this.renderer.state.getBlockContent(block)
      ).element
    );
    this.renderer.measurements.setIntrinsicSize(
      element,
      this.renderer.measurements.sizes.heightOf(block)
    );
    this.renderer.cache.markBuilt(element, key);
    this.renderer.measurements.markPending(element);
    return element;
  }
}

/** Whether a node inside the prose root belongs to the renderer. */
function isRendererOwned(node: Node): boolean {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  return (
    node.classList.contains('markdown-block') ||
    node.hasAttribute('data-virtual-spacer')
  );
}
