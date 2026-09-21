/**
 * Renders a `thematicBreak` node as an `<hr>`. A rule holds no text at all, so
 * while the caret is at it the node is built as its raw markdown instead.
 *
 * May import: the revealable contract (`revealable_node.ts`) and the AST types.
 * Upholds: the source view is built from the node's own markdown, so the rule
 * shows its source while the caret is inside it and renders itself otherwise.
 */

import type { AstThematicBreak } from '../ast';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-thematic-break-source';

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
