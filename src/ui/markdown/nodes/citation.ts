/**
 * Renders a pandoc `citation` node as a highlighted, APA-formatted span (e.g.
 * "(Smith, 2020)" or "Smith (2020)"). The raw source is shown immediately; the
 * CSL formatting (expensive on first use) runs only when the citation approaches
 * the viewport. Clicking enters the markdown source.
 *
 * May import: the revealable contract (`revealable_node.ts`), the render context
 * (`render_context.ts`, which hands in the formatted reference), the viewport observer
 * (`lazy.ts`) and the AST types.
 * Upholds: the source view is built from the node's own markdown, so the node
 * shows its source while the caret is inside it and renders itself otherwise.
 */

import type { AstCitation } from '../ast';
import { onNearViewport } from '../lazy';
import { renderContext } from '../render_context';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-citation-source';

export class Citation extends RevealableNodeComponent {
  constructor(node: AstCitation) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, citationRange);
    super('citation', node, sourceView ?? document.createElement('span'), sourceView ? '' : 'markdown-citation');
    if (sourceView) {
      return;
    }
    // The lazy format runs long after the render pass that handed the answers in, so the answers
    // are captured now, while they are in force.
    const app = renderContext();
    this.element.classList.add('markdown-citation-placeholder');
    this.element.textContent = app.citation(node.value, true) ?? node.value;
    onNearViewport(this.element, () => {
      this.element.textContent = app.citation(node.value, false) ?? node.value;
      this.element.classList.remove('markdown-citation-placeholder');
    });
  }

  /** The key after the opening marker: `[@key]` → `@key`, `@key` → `key`. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return citationRange(source);
  }
}

/** The key and locator after the opening marker, without the closing bracket. */
function citationRange(source: string): { start: number; end: number } {
  const start = source.startsWith('[') ? 1 : source.startsWith('-@') ? 2 : source.startsWith('@') ? 1 : 0;
  const end = source.endsWith(']') ? source.length - 1 : source.length;
  return { start, end };
}
