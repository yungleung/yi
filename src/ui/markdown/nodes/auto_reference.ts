/**
 * Renders an automatic cross-reference as a normal link with inferred text.
 *
 * The source remains `[#id]`. While the caret is inside the node the source
 * appears for editing; otherwise the target index supplies its visible text.
 *
 * May import: the revealable node contract, the source view, the render context
 * and the AST types. Upholds: the source view is built from the node's own
 * Markdown and the link target is named by that source.
 */

import type { AstAutoReference } from '../ast';
import { renderContext } from '../render_context';
import { enterSourceOf } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-auto-reference-source';

export class AutoReference extends RevealableNodeComponent {
  constructor(node: AstAutoReference) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, idRange);
    super(
      'autoReference',
      node,
      sourceView ?? document.createElement('a'),
      sourceView ? '' : 'markdown-link'
    );
    if (sourceView) {
      return;
    }
    const anchor = this.element as HTMLAnchorElement;
    anchor.setAttribute('data-auto-reference', node.id);
    const resolved = renderContext().referenceText(node.id);
    anchor.href = `#${node.id}`;
    anchor.textContent = resolved.text;
    if (!resolved.resolved) {
      anchor.classList.add('markdown-auto-reference-unresolved');
    }
    anchor.addEventListener('click', (event) => event.preventDefault());
    anchor.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (this.sourceShown) {
          return;
        }
        event.stopPropagation();
        enterSourceOf(this.element, this.entryOffset());
        (this.element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
      },
      true
    );
  }

  /** The identifier between `[#` and `]`. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return idRange(source);
  }
}

/** The identifier source range inside `[#id]`. */
function idRange(source: string): { start: number; end: number } {
  const close = source.lastIndexOf(']');
  return { start: 2, end: close >= 2 ? close : source.length };
}
