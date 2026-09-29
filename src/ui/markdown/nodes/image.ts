/**
 * Renders an `image` node; clicking it enters the markdown that made it.
 *
 * The destination the author wrote is turned into something the webview can load
 * (`image_sources.ts`): a web URL is itself, and a path is a file the app has to hand over through
 * the asset protocol. A relative path may mean a file beside the note or one in the folder the
 * settings name for images, so the candidates are tried in that order and the next is taken when
 * the browser says the first did not load — the browser is the only thing here that can answer
 * whether a file is there, and it answers by asking for it.
 *
 * May import: the revealable contract (`revealable_node.ts`) and the AST types.
 * Upholds: the source view is built from the node's own markdown, so the image
 * shows its source while the caret is inside it and renders itself otherwise.
 */

import { imageSourceCandidates } from '../image_sources';
import type { AstImage } from '../ast';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-image-source';

export class Image extends RevealableNodeComponent {
  constructor(node: AstImage) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, altRange);
    super('image', node, sourceView ?? document.createElement('img'), sourceView ? '' : 'max-w-full');
    if (sourceView) {
      return;
    }
    const img = this.element as HTMLImageElement;
    img.alt = node.alt || '';
    img.title = node.title || '';
    const candidates = imageSourceCandidates(node.url ?? '');
    let next = 0;
    img.addEventListener('error', () => {
      next += 1;
      if (next < candidates.length) {
        img.src = candidates[next];
      }
    });
    img.src = candidates[0] ?? node.url ?? '';
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
