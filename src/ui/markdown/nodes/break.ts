import { RevealableNodeComponent } from './revealable_node';
import type { AstBreak } from '../ast';

/**
 * Renders a hard `break` node as a `<br>`. It is revealable like the other
 * inline nodes: the raw source (`\`) shows when the caret sits at its
 * boundary or inside it.
 */
export class Break extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-break-source';

  constructor(node: AstBreak) {
    super('break', node, document.createElement('br'));
  }

  /** The whole marker is the content; there are no delimiters to skip. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return { start: 0, end: source.length };
  }

  /** A `<br>` has no text and a degenerate rect; place the caret at the source start. */
  protected override sourceOffsetForClick(
    _clientX: number,
    _clientY: number
  ): number | undefined {
    return 0;
  }
}
