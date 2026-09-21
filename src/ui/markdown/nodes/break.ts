import type { AstBreak } from '../ast';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-break-source';

/**
 * Renders a hard `break` node as a `<br>`, which holds no text at all: while
 * the caret is at it, the node is built as its raw source (`\` or the line's
 * trailing spaces) so the caret has somewhere to be.
 */
export class Break extends RevealableNodeComponent {
  constructor(node: AstBreak) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wholeSource);
    super('break', node, sourceView ?? document.createElement('br'), sourceView ? '' : '');
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
