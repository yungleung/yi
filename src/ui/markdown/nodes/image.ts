import type { AstImage } from '../ast';
import { RevealableNodeComponent } from './revealable_node';

/** Renders an `image` node. */
export class Image extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-image-source';

  constructor(node: AstImage) {
    super('image', node, document.createElement('img'), 'max-w-full');
    const img = this.element as HTMLImageElement;
    img.src = node.url || '';
    img.alt = node.alt || '';
    img.title = node.title || '';
  }

  /**
   * An image has no rendered text to walk, so the click maps proportionally
   * across the image onto the alt text (content-relative; the base adds the
   * `![` marker offset).
   */
  protected override sourceOffsetForClick(
    clientX: number,
    _clientY: number
  ): number | undefined {
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0) {
      return undefined;
    }
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const altLength = (this.node as AstImage).alt?.length ?? 0;
    return Math.round(ratio * altLength);
  }

  /** The alt text between the `![` and `]` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    const close = source.indexOf(']');
    return { start: 2, end: close > 0 ? close : source.length };
  }
}
