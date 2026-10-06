/**
 * Re-renders what an edit changed inside a block, and nothing else.
 *
 * An edit inside a block usually changes one node — the text the caret is in — so
 * this builds again only the children whose own source changed, recursing into a
 * container that survived but whose children did not. Keeping the rest is not an
 * optimisation of the DOM's size but of its churn: replacing a block's element
 * invalidates the layout of everything in and below it, which is where a
 * keystroke's tens of milliseconds go (see `test/probes/block-rebuild-cost.js`:
 * rebuilding the fixture note's last block and forcing layout costs ~26 ms,
 * patching one text node inside it and forcing layout costs ~1 ms).
 *
 * What each container holds is remembered here rather than read back out of the
 * DOM, because a record compares the child's own source, and that source is the
 * text the edit replaced — gone by the time the patch runs. The records are filled
 * in when a block is built (`rememberChildren`) and rewritten by every patch.
 *
 * May import: the registry, the pure plan (`document/block_children.ts`), the block
 * model and `source_mode.ts`'s render frame. Upholds: a node's rendering is a pure
 * function of its own source — this is that rule applied to the DOM the renderer
 * already built.
 */

import type { RootContent } from 'mdast';
import { reusePlan, type RenderedChild } from './document/block_children';
import { blockParseInput, type BlockNode } from './document/blocks';
import { createComponent, elementBuiltFor, rendersChildrenOnly } from './registry';
import { isShownSource, withRenderFrame } from './source_mode';

/** What one container element was built from: its children, node by node. */
interface ChildRecord {
  node: RootContent;
  /** The child's own slice of the block's parse input, as it was when built. */
  source: string;
  /** `'source'` while the child's own source was the one being shown, else `''`. */
  shape: string;
  /** The element built for it, or null for a node type that renders nothing. */
  element: HTMLElement | null;
}

/** What each container element holds, filled in when it is built and by a patch. */
const rendered = new WeakMap<HTMLElement, ChildRecord[]>();

/** A node's own slice of the block's parse input, or '' when it has no range. */
function sourceOf(node: RootContent, prepared: string): string {
  const position = (node as { position?: { start: { offset?: number }; end?: { offset?: number } } })
    .position;
  return position?.start.offset !== undefined && position.end?.offset !== undefined
    ? prepared.slice(position.start.offset, position.end.offset)
    : '';
}

/**
 * The shape a node is built in, as a key: `'source'` while its own source is the
 * one being shown. Read inside a render frame, since `isShownSource` needs the
 * block being built to place the node's positions in the document.
 */
function shapeOf(node: RootContent): string {
  return isShownSource(node) ? 'source' : '';
}

/** The key the plan matches on: what the node is, its source, and its shape. */
function keyOf(node: RootContent, prepared: string): RenderedChild {
  return { type: node.type, source: sourceOf(node, prepared), shape: shapeOf(node) };
}

/** An mdast node's children, if it has any. */
function childrenOf(node: RootContent): RootContent[] {
  const children = (node as { children?: RootContent[] }).children;
  return Array.isArray(children) ? children : [];
}

/**
 * Records what a container holds, for the children that were just built inside it.
 * Called once for a block's element — inside a render frame, so each child's shape
 * can be read — and by `patchChildren` for the nodes it builds. Where each child's
 * element is comes from the registry, which built it (see `elementBuiltFor`).
 */
export function rememberChildren(
  element: HTMLElement,
  children: readonly RootContent[],
  prepared: string
): void {
  rendered.set(
    element,
    children.map((node) => {
      const child = elementBuiltFor(node);
      const inner = childrenOf(node);
      if (child && inner.length > 0) {
        rememberChildren(child, inner, prepared);
      }
      return { node, source: sourceOf(node, prepared), shape: shapeOf(node), element: child };
    })
  );
}

/**
 * Rebuilds inside `container` only the children `next` changed, in order, and
 * records what it holds now.
 */
function patchChildren(container: HTMLElement, next: readonly RootContent[], prepared: string): void {
  const previous = rendered.get(container) ?? [];
  const plan = reusePlan(
    previous.map((record) => ({ type: record.node.type, source: record.source, shape: record.shape })),
    next.map((node) => keyOf(node, prepared))
  );
  const used = new Set<number>();
  plan.forEach((index) => {
    if (index >= 0) {
      used.add(index);
    }
  });
  const kept: Node[] = [];
  const records: ChildRecord[] = [];
  next.forEach((node, index) => {
    let record = plan[index] >= 0 ? previous[plan[index]] : undefined;
    if (!record) {
      const free = previous.findIndex(
        (candidate, at) => !used.has(at) && enterable(candidate, node)
      );
      if (free >= 0) {
        record = previous[free];
        used.add(free);
      }
    }
    const reused = record?.element ?? null;
    const element = reused ?? createComponent(node)?.element ?? null;
    if (!element) {
      records.push({ node, source: sourceOf(node, prepared), shape: shapeOf(node), element: null });
      return;
    }
    if (reused) {
      const inner = childrenOf(node);
      if (inner.length > 0) {
        patchChildren(reused, inner, prepared);
      }
    }
    kept.push(element);
    records.push({
      node,
      source: sourceOf(node, prepared),
      shape: shapeOf(node),
      element
    });
  });
  // Everything the new children need, in order, then whatever is left over.
  for (const element of kept) {
    container.appendChild(element);
  }
  // Only what this container was recorded as holding: the caret span and anything
  // else living inside a block is not the patch's to remove.
  for (const record of previous) {
    if (record.element && !kept.includes(record.element)) {
      record.element.remove();
    }
  }
  // The records are written from what this patch itself built and kept: the
  // registry knows the element of a node it has just created, and this is the
  // place that knows which element each new node ended up with — including the
  // ones that were kept, whose nodes are new objects every parse.
  rendered.set(container, records);
}

/**
 * Whether a record the exact plan did not claim can still be entered: a container
 * whose element is only its children, with its own source changed, so nothing
 * about the element itself is stale — a paragraph whose text was typed into, an
 * emphasis whose contents moved. Everything else with a changed source is built
 * again, and a record is only ever handed out once.
 */
function enterable(record: ChildRecord, node: RootContent): boolean {
  return (
    record.element !== null &&
    record.node.type === node.type &&
    record.shape === shapeOf(node) &&
    childrenOf(node).length > 0 &&
    rendersChildrenOnly(node.type)
  );
}

/** Re-renders the parts of an already-built block element that the edit changed. */
export function patchBlock(element: HTMLElement, block: BlockNode, children: readonly RootContent[]): void {
  const prepared = blockParseInput(block);
  withRenderFrame(block, () => {
    patchChildren(element, children, prepared);
  });
}
