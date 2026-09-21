import type { AstImage } from '../ast';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-image-source';

/** Renders an `image` node; clicking it enters the markdown that made it. */
export class Image extends RevealableNodeComponent {
  constructor(node: AstImage) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, altRange);
    super('image', node, sourceView ?? document.createElement('img'), sourceView ? '' : 'max-w-full');
    if (sourceView) {
      return;
    }
    const img = this.element as HTMLImageElement;
    img.src = node.url || '';
    img.alt = node.alt || '';
    img.title = node.title || '';
  }

  /** The alt text between the `![` and `]` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return altRange(source);
  }
}

/** The alt text between the `![` and `]` markers. */
function altRange(source: string): { start: number; end: number } {
  const close = source.indexOf(']');
  return { start: 2, end: close > 0 ? close : source.length };
}
