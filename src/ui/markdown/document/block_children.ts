/**
 * Which of a block's children an edit left alone.
 *
 * A block renders as the nodes the parser made from its own text, and an edit
 * inside it usually changes one of them: a character typed into a paragraph's
 * text leaves its citations, links and emphasis exactly as they were. This is the
 * decision that lets the renderer keep their elements — a child is the one that
 * was there before when its type, its own source and its shape are unchanged,
 * which is the statement `blocks.ts: blockContentKey` makes about a block, one
 * level down. The shape is in the key because a node whose own source is the one
 * being shown (`source_mode.ts`) is a different element: a link with the caret in
 * it is the markdown, not its title.
 *
 * May import: nothing — the children and their sources are passed in. Upholds: a
 * node's rendering is a pure function of its own source, so a node whose source is
 * unchanged is the node it was.
 */

/** A child as the renderer built it: what it is, the source it came from, and its shape. */
export interface RenderedChild {
  type: string;
  source: string;
  /** `'source'` while the node's own source is the one being shown, else `''`. */
  shape: string;
}

/**
 * For each of `next`, the index in `previous` whose element it can reuse, or -1
 * when it has to be built. A previous child is handed out at most once, so two
 * identical children keep one element each rather than the same one twice.
 */
export function reusePlan(
  previous: readonly RenderedChild[],
  next: readonly RenderedChild[]
): number[] {
  const byType = new Map<string, Map<string, Map<string, number[]>>>();
  previous.forEach((child, index) => {
    const bySource = byType.get(child.type) ?? new Map<string, Map<string, number[]>>();
    const byShape = bySource.get(child.source) ?? new Map<string, number[]>();
    const indexes = byShape.get(child.shape) ?? [];
    indexes.push(index);
    byShape.set(child.shape, indexes);
    bySource.set(child.source, byShape);
    byType.set(child.type, bySource);
  });
  return next.map((child) => {
    const indexes = byType.get(child.type)?.get(child.source)?.get(child.shape);
    return indexes && indexes.length > 0 ? indexes.shift()! : -1;
  });
}
