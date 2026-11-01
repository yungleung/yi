/**
 * Where the nodes of one kind stand in a parse, by their document offsets.
 *
 * Two readers ask the parse this and nothing else: the export pre-process, which rewrites the text
 * under those offsets (`preprocess.ts`), and the card's font hint, which reports the characters they
 * hold (`workflow/font_hint.ts`). A node the parser gave no position is skipped — it cannot be pointed at in
 * the text, so there is nowhere to write or report its answer.
 *
 * May import: the AST and the position type. Upholds: one answer to *where is that node*, so two
 * readers that care about offsets cannot disagree about them.
 */

import type { Position } from 'unist';
import type { AstNode } from '../markdown/ast';

/** A node of a parse, and where it stands. mdast sets a position on every node it builds from a
 * token, but the custom constructs the editor's plugins add declare only what a *component* reads
 * (`plugins/remark-wikilink`, `plugins/remark-citation`), so the position is asked for here — which
 * is what a reader that rewrites or reports needs and a renderer never does. */
export type PositionedNode = AstNode & { position?: Position };

/** A node of a parse, as much of it as walking needs. */
export interface Walkable {
  type?: string;
  children?: Walkable[];
}

/** One node of the parse, and where it stands in the text it was parsed from. */
export interface Span {
  start: number;
  end: number;
  node: PositionedNode;
}

/** Every node of a parse, parents before children. */
function walk(node: Walkable, at: (node: PositionedNode) => void): void {
  at(node as unknown as PositionedNode);
  for (const child of node.children ?? []) {
    walk(child, at);
  }
}

/** Every node of one type, in the order they are written, by their document offsets. */
export function spansOfType(tree: Walkable, type: AstNode['type']): Span[] {
  const spans: Span[] = [];
  walk(tree, (node) => {
    if (node.type !== type) {
      return;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) {
      return;
    }
    spans.push({ start, end, node });
  });
  return spans;
}
