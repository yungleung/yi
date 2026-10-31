/**
 * Verifies that a plain keystroke did not change the Markdown shape beside it.
 *
 * Example: typing `**` in a paragraph can turn it into a formatted run; the
 * edited block is checked after the burst settles and rebuilt only if its parse
 * shape differs from the one its current DOM was built from.
 *
 * May import: the edit context type, the block model and the pure node-shape
 * rule. Upholds: one pending timer per block/editor, a burst keeps the first
 * captured shape, and verification only ever repairs from the document.
 */

import type { EditorContext } from './context';
import type { MarkdownBlock } from '../document/blocks';
import { nodeShape } from '../syntax/node_shape';

/**
 * How long after the last plain keystroke a block's parse is checked, in
 * milliseconds: long enough that a burst of typing costs one check rather than
 * one per keystroke, short enough that a block rendered in the wrong shape is
 * put right while the author is still looking at it.
 */
const VERIFY_DELAY_MS = 200;

interface PendingVerify {
  /** The parse shape the block's element was built from. */
  readonly shape: string;
  /** Whether this edit can change how blocks outside the edited one render. */
  readonly syncDependents: boolean;
  /** The timer that will do the check, replaced by every keystroke of the burst. */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The checks waiting, one entry per block and one map per editor. Keyed by the
 * context rather than by the module, so a second editor — or the next document
 * loaded into this one — cannot inherit another editor's pending checks.
 */
const pendingVerify = new WeakMap<EditorContext, Map<number, PendingVerify>>();

/**
 * Remembers the shape the block's element was built from, and schedules the check
 * that a plain keystroke did not quietly change it.
 *
 * A keystroke replaces the pending timer instead of queueing another and keeps
 * the shape captured by the first edit in the burst. A block an ordinary edit
 * rebuilt in between is compared with a shape it never had, which costs one
 * render and cannot produce a wrong page: the check only decides whether to
 * render again from the document.
 */
export function scheduleEditVerification(
  context: EditorContext,
  block: MarkdownBlock,
  syncDependents: boolean
): void {
  const lineStart = block.lineStart;
  const pending = pendingFor(context);
  const waiting = pending.get(lineStart);
  const shape = waiting?.shape ?? nodeShape(context.state.getBlockContent(block));
  if (waiting) {
    clearTimeout(waiting.timer);
  }
  const timer = setTimeout(() => {
    const current = pending.get(lineStart);
    pending.delete(lineStart);
    if (current?.syncDependents === true) {
      // A definition's label can change how another block parses even though that
      // block's own text did not move. Reconcile every block once the burst ends.
      context.renderer.renderChanged();
    } else {
      verifyBlock(context, lineStart, shape);
    }
  }, VERIFY_DELAY_MS);
  pending.set(lineStart, { shape, syncDependents, timer });
}

function pendingFor(context: EditorContext): Map<number, PendingVerify> {
  const existing = pendingVerify.get(context);
  if (existing) {
    return existing;
  }
  const created = new Map<number, PendingVerify>();
  pendingVerify.set(context, created);
  return created;
}

/**
 * Renders the block again when it no longer parses to the shape it was built
 * from. A block that is gone, or is not mounted, has nothing to put right.
 */
function verifyBlock(context: EditorContext, lineStart: number, shape: string): void {
  const block = context.state.getBlockAtLine(lineStart);
  if (!block || nodeShape(context.state.getBlockContent(block)) === shape) {
    return;
  }
  context.renderer.renderBlock(lineStart);
}
