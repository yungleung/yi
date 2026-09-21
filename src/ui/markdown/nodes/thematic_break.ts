import type { AstThematicBreak } from '../ast';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-thematic-break-source';

/**
 * Renders a `thematicBreak` node as an `<hr>`, which holds no text at all:
 * while the caret is at it, the node is built as its raw markdown (`***`) so
 * the caret has somewhere to be.
 */
export class ThematicBreak extends RevealableNodeComponent {
  constructor(node: AstThematicBreak) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wholeSource);
    super('thematicBreak', node, sourceView ?? document.createElement('hr'), sourceView ? '' : 'min-w-0');
  }

  /** The whole marker is the content; there are no delimiters to skip. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return wholeSource(source);
  }
}

/** A node whose whole source is its content. */
function wholeSource(source: string): { start: number; end: number } {
  return { start: 0, end: source.length };
}
