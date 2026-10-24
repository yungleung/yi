/**
 * Renders an implicit figure with its image, caption, and computed number.
 *
 * The rendering is a figure-level source target: clicking any part reveals the
 * complete image Markdown, including trailing attributes. Normal rendering
 * keeps generated numbering out of the document's source and offsets.
 *
 * May import: the revealable node contract, the node registry, source mode,
 * render context and AST types. Upholds: a block's rendering is a pure function
 * of its own source and the document's resolved target number.
 */

import type { AstFigure } from '../ast';
import { createComponent } from '../registry';
import { renderContext } from '../render_context';
import { enterSourceOf, renderingBlock } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-figure-source';

export class Figure extends RevealableNodeComponent {
  constructor(node: AstFigure) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wholeSource);
    super(
      'figure',
      node,
      sourceView ?? document.createElement('figure'),
      sourceView ? '' : 'markdown-figure'
    );
    if (sourceView) {
      return;
    }
    if (node.id) {
      this.element.id = node.id;
    }
    const image = node.children[0];
    const renderedImage = createComponent(image);
    if (renderedImage) {
      this.element.appendChild(renderedImage.element);
    }
    const caption = document.createElement('figcaption');
    caption.className = 'markdown-figure-caption';
    const block = renderingBlock();
    const start = node.position?.start.offset;
    const from = block && start !== undefined ? block.charStart + start : null;
    const number = from === null ? null : renderContext().figureLabelAt(from);
    if (number) {
      const label = document.createElement('span');
      label.className = 'markdown-figure-number';
      label.setAttribute('data-chrome', 'true');
      label.textContent = `${number}.`;
      caption.appendChild(label);
      caption.appendChild(document.createTextNode(' '));
    }
    caption.appendChild(document.createTextNode(String(image.alt ?? '')));
    this.element.appendChild(caption);

    // The image component has its own capture handler. Enter the complete
    // figure source first, so its attributes remain beside the image source.
    this.element.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        enterSourceOf(this.element, this.entryOffset());
        (this.element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
      },
      true
    );
  }

  /** The complete figure is its own source. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return wholeSource(source);
  }
}

/** The source view is the whole figure, so its content range is the whole node. */
function wholeSource(source: string): { start: number; end: number } {
  return { start: 0, end: source.length };
}
