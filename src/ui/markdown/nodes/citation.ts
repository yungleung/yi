import type { AstCitation } from '../ast';
import { bibliographyManager } from '../../../services/bibliography';
import { RevealableNodeComponent } from './revealable_node';
import { onNearViewport } from '../lazy';

/**
 * Renders a pandoc `citation` node as a highlighted, APA-formatted span
 * (e.g. "(Smith, 2020)" or "Smith (2020)"). The raw source is shown
 * immediately; the CSL formatting (expensive on first use) runs only when the
 * citation approaches the viewport. Clicking reveals the markdown source.
 */
export class Citation extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-citation-source';

  constructor(node: AstCitation) {
    super('citation', node, document.createElement('span'), 'markdown-citation');
    this.element.classList.add('markdown-citation-placeholder');
    this.element.textContent = bibliographyManager.formatCached(node.value) ?? node.value;
    onNearViewport(this.element, () => {
      this.element.textContent = bibliographyManager.format(node.value);
      this.element.classList.remove('markdown-citation-placeholder');
    });
  }

  /** The key after the opening marker: `[@key]` → `@key`, `@key` → `key`. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    const start = source.startsWith('[') ? 1 : source.startsWith('-@') ? 2 : source.startsWith('@') ? 1 : 0;
    const end = source.endsWith(']') ? source.length - 1 : source.length;
    return { start, end };
  }
}
