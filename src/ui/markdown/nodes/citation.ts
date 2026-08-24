import type { AstCitation } from '../ast';
import { bibliographyManager } from '../../../services/bibliography';
import { RevealableNodeComponent } from './revealable_node';

/**
 * Renders a pandoc `citation` node as a highlighted, APA-formatted span
 * (e.g. "(Smith, 2020)" or "Smith (2020)"). Clicking reveals its markdown
 * source (`[@key, …]` or `@key`) with the caret at the end.
 */
export class Citation extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-citation-source';

  constructor(node: AstCitation) {
    super('citation', node, document.createElement('span'), 'markdown-citation');
    this.element.textContent = bibliographyManager.format(node.value);
  }

  /** The key after the opening marker: `[@key]` → `@key`, `@key` → `key`. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    const start = source.startsWith('[') ? 1 : source.startsWith('-@') ? 2 : source.startsWith('@') ? 1 : 0;
    const end = source.endsWith(']') ? source.length - 1 : source.length;
    return { start, end };
  }
}
