/**
 * A depth-first visit over an mdast-shaped node and its descendants.
 *
 * Example: `walk(root, node => { if (node.type === 'table') tables.push(node); })`
 * visits the root before its first child and then every nested node once.
 *
 * May import: nothing. Upholds: a callback sees a node before any child, and a
 * node with no array-valued `children` ends that branch.
 */
export function walk(node: unknown, callback: (node: any) => void): void {
  callback(node);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      walk(child, callback);
    }
  }
}
