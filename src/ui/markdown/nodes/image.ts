import type { AstImage } from '../ast';
import { RevealableNodeComponent } from './revealable_node';

/** Renders an `image` node. */
export class Image extends RevealableNodeComponent {
  constructor(node: AstImage) {
    super('image', node, document.createElement('img'), 'max-w-full');
    const img = this.element as HTMLImageElement;
    img.src = node.url || '';
    img.alt = node.alt || '';
    img.title = node.title || '';
  }

  /**
   * Clicking a rendered image replaces it with its markdown source in place and
   * places the caret after the last character, ready for source editing.
   */
  override placeCaretAt(): void {
    this.revealSource('markdown-image-source');
  }
}
