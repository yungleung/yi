/**
 * The shape of a parse: the node types and their nesting, with the text left out.
 *
 * Two parses have the same shape when an edit only changed characters — the same
 * nodes in the same places, with different text inside one of them. It is what says
 * "this edit could not have changed the rendering", which is the promise the fast
 * path in `editing/context.ts` makes and the property
 * `test/checks/check-plain-edit.mjs` checks.
 *
 * May import: nothing — a parse is passed in. Upholds: one fact about markdown
 * syntax has one home, and this is the home of what "the same parse" means.
 */

interface ShapedNode {
  type: string;
  children?: readonly ShapedNode[];
}

/** A parse's node types and nesting, text and positions left out. */
export function nodeShape(nodes: readonly ShapedNode[]): string {
  return nodes
    .map((node) =>
      node.children && node.children.length > 0
        ? `${node.type}(${nodeShape(node.children)})`
        : node.type
    )
    .join(',');
}
