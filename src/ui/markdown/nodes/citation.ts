import type { CitationNode } from './editable_node';
import { bibliographyManager } from '../../../services/bibliography';
import { RevealableNodeComponent } from './revealable_node';

/**
 * Renders a pandoc `citation` node as a highlighted, APA-formatted span
 * (e.g. "(Smith, 2020)" or "Smith (2020)"). Clicking reveals its markdown
 * source (`[@key, …]` or `@key`) with the caret at the end.
 */
export class Citation extends RevealableNodeComponent {
  constructor(node: CitationNode) {
    super('citation', node, document.createElement('span'), 'markdown-citation');
    this.element.textContent = bibliographyManager.format(node.value);
  }

  override placeCaretAt(): void {
    this.revealSource('markdown-citation-source');
  }
}
