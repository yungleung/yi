import type { RootContent } from 'mdast';
import { serializeMarkdown } from '../parser';
import { RevealableNodeComponent } from './revealable_node';
import type { AstThematicBreak } from '../ast';

/**
 * Renders a `thematicBreak` node as an `<hr>`. Like the other revealable
 * nodes, the raw markdown (`***`) shows when the caret sits at its boundary
 * or inside it, and clicking the rule reveals the source.
 */
export class ThematicBreak extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-thematic-break-source';

  constructor(node: AstThematicBreak) {
    super('thematicBreak', node, document.createElement('hr'), 'min-w-0');
  }

  /** The whole marker is the content; there are no delimiters to skip. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return { start: 0, end: source.length };
  }

  /** The rule has no text to click; map the click proportionally to the source. */
  protected override sourceOffsetForClick(
    clientX: number,
    _clientY: number
  ): number | undefined {
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0) {
      return undefined;
    }
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * source.length);
  }
}
