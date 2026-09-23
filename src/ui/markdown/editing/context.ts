/**
 * Shared plumbing for the editor's editing commands.
 *
 * Every command (clipboard, typing, find/replace, formatting) needs the same
 * three things: the document state, the block renderer and the scroll
 * container that hosts the prose root. Passing that context explicitly keeps
 * the commands free of editor internals and lets them live in their own
 * modules. The helpers here also centralise range→offset mapping, so any
 * command works the same whether its range is a text selection, a boundary
 * inside a block, or a Select-All range anchored to the prose root.
 *
 * May import: the caret, the offsets mapping (`caret/offsets.ts`,
 * `caret/dom_position.ts`), the renderer, the state, `source_mode.ts` and the
 * syntax rules the typing fast path reads (`syntax/plain_edit.ts`,
 * `syntax/node_shape.ts`). Upholds: every command funnels its change through
 * `applyEdit`, so the change → re-render → place-the-caret sequence is
 * identical everywhere.
 */

import { getCaretRange, scheduleCaret, setSelectionRange } from '../caret/caret';
import { moveShownSource, setShownRange, shownSourceHeld, withHeldShownSource } from '../source_mode';
import { documentOffsetAt } from '../caret/offsets';
import { domPositionAtOffset } from '../caret/dom_position';
import { showsSource } from '../registry';
import { isPlainEdit } from '../syntax/plain_edit';
import { nodeShape } from '../syntax/node_shape';
import { plainRun, writeRun } from './typed_text';
import type { RootContent } from 'mdast';
import type { MarkdownBlock } from '../document/blocks';
import type { MarkdownEditorState } from '../document/state';
import type { VirtualBlockRenderer } from '../virtual_block_renderer';

/** What every editing command needs to read and change the document. */
export interface EditorContext {
  readonly state: MarkdownEditorState;
  readonly renderer: VirtualBlockRenderer;
  readonly contentView: HTMLElement;
}

/**
 * How long after the last plain keystroke a block's parse is checked, in
 * milliseconds: long enough that a burst of typing costs one check rather than
 * one per keystroke, short enough that a block rendered in the wrong shape is
 * put right while the author is still looking at it.
 */
const VERIFY_DELAY_MS = 200;

/** A block whose plain keystroke has not been checked yet. */
interface PendingVerify {
  /** The parse shape the block's element was built from (see `scheduleVerify`). */
  readonly shape: string;
  /** The timer that will do the check, replaced by every keystroke of the burst. */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The checks waiting, one entry per block and one map per editor. Keyed by the
 * context rather than by the module, so a second editor — or the next document
 * loaded into this one — cannot inherit another editor's pending checks.
 */
const pendingVerify = new WeakMap<EditorContext, Map<number, PendingVerify>>();

/** The rendered prose root, or null while the editor is not mounted. */
export function proseRoot(context: EditorContext): HTMLElement | null {
  return context.contentView.querySelector('.prose');
}

/**
 * The range an edit acts on: the browser selection when it is inside the
 * editor, otherwise (for caret-only commands) the logical caret. A collapsed
 * native selection is ignored because the editor hides it while its own caret
 * is shown.
 */
export function editorSelection(context: EditorContext, allowCollapsed: boolean): Range | null {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (
      context.contentView.contains(range.commonAncestorContainer) &&
      (allowCollapsed || !range.collapsed)
    ) {
      return range;
    }
  }
  if (allowCollapsed) {
    const caret = getCaretRange();
    if (caret && context.contentView.contains(caret.commonAncestorContainer)) {
      return caret;
    }
  }
  return null;
}

/**
 * The document offsets a DOM range covers, or null when it cannot be mapped.
 *
 * Boundaries that are not text positions (Select All anchors to the prose
 * root, a drag can anchor to a block element) are resolved to the first/last
 * document offset of the block they touch, so a multi-block selection maps to
 * exactly the blocks it spans instead of collapsing to the whole document.
 */
export function rangeOffsets(
  context: EditorContext,
  range: Range
): { from: number; to: number } | null {
  const start = boundaryOffset(context, range.startContainer, range.startOffset, 'start');
  const end = boundaryOffset(context, range.endContainer, range.endOffset, 'end');
  if (start === null || end === null) {
    return null;
  }
  return { from: Math.min(start, end), to: Math.max(start, end) };
}

/** The document offset of one range boundary. */
function boundaryOffset(
  context: EditorContext,
  container: Node,
  offset: number,
  side: 'start' | 'end'
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const location = documentOffsetAt(context.state, container, offset);
    return location ? location.offset : null;
  }
  const root = proseRoot(context);
  const element = container as Element;
  if (!root || element === root || !root.contains(element)) {
    return rootBoundaryOffset(context, root, offset, side);
  }
  // A boundary anchored to an element *inside* a block is a text position like
  // any other: the caret beside a widget (a link, an image, a formula) is
  // anchored to the paragraph that holds it, and maps through the block's own
  // model like a caret in its text. Only a boundary on the block element
  // itself — a drag that anchored to it, Select All — means the block's edge.
  if (!element.matches('.markdown-block')) {
    const location = documentOffsetAt(context.state, container, offset);
    if (location) {
      return location.offset;
    }
  }
  return blockEdgeOffset(context, element, side);
}

/** A boundary anchored to the prose root: resolve it against its child blocks. */
function rootBoundaryOffset(
  context: EditorContext,
  root: HTMLElement | null,
  offset: number,
  side: 'start' | 'end'
): number | null {
  if (!root) {
    return null;
  }
  const children = [...root.children];
  const documentLength = context.state.getText().length;
  if (side === 'start') {
    // A boundary before the first child means "from the document start" —
    // this is what Select All produces, including the blocks that are not
    // mounted at the moment.
    if (offset <= 0) {
      return 0;
    }
    for (let index = Math.min(offset, children.length - 1); index < children.length; index += 1) {
      const block = blockWithin(children[index]);
      if (block) {
        return blockEdgeOffset(context, block, 'start');
      }
    }
    return documentLength;
  }
  // Likewise, a boundary past the last child means "to the document end".
  if (offset >= children.length) {
    return documentLength;
  }
  for (let index = offset - 1; index >= 0; index -= 1) {
    const block = blockWithin(children[index]);
    if (block) {
      return blockEdgeOffset(context, block, 'end');
    }
  }
  return documentLength;
}

/** The first/last document offset of an element's block. */
function blockEdgeOffset(
  context: EditorContext,
  element: Element,
  side: 'start' | 'end'
): number | null {
  const blockElement = blockWithin(element);
  if (!blockElement) {
    return null;
  }
  const block = context.state
    .getBlocks()
    .find((candidate) => String(candidate.lineStart) === blockElement.dataset.lineStart);
  if (!block) {
    return null;
  }
  return side === 'start' ? block.charStart : block.charEnd;
}

/** The block element itself or the first one inside it. */
function blockWithin(node: Element | undefined): HTMLElement | null {
  if (!node) {
    return null;
  }
  if (node.matches('.markdown-block')) {
    return node as HTMLElement;
  }
  return node.querySelector<HTMLElement>('.markdown-block');
}

/** The document offset of the active caret, or null when there is none. */
export function caretOffset(context: EditorContext): number | null {
  const range = editorSelection(context, true);
  if (!range) {
    return null;
  }
  const start = documentOffsetAt(context.state, range.startContainer, range.startOffset);
  return start ? start.offset : null;
}

/**
 * The block holding `offset` shows its own text, if it is a block whose
 * rendering cannot hold a caret; `null` shows no block's source at all (see
 * `source_mode.ts`). The blocks whose shape changed are re-rendered, which is
 * what puts the text — or the view — in the document.
 */
export function showSourceAt(context: EditorContext, offset: number | null): void {
  // The plain write's caret placement holds this: it knows the caret is in the node
  // it was in, so the decision cannot have changed, and asking would parse the
  // block (see `source_mode.ts: withHeldShownSource`).
  if (shownSourceHeld()) {
    return;
  }
  const range = offset === null ? null : sourceRangeAt(context.state, offset);
  if (!setShownRange(range)) {
    return;
  }
  // The blocks that change shape are rebuilt, and a caret's DOM range is not
  // dropped by that: the browser relocates it to the element that replaced its
  // text, where it looks connected while sitting somewhere the author never
  // put it. So the caret is placed again by offset — the truth, because the
  // editor computed it — whenever the shape changed under it.
  context.renderer.renderChanged();
  if (offset !== null) {
    placeCaret(context, offset);
  }
}

/**
 * The source a caret at this document offset is inside, as its own range: the
 * node the caret is in, when that node has a source to show. A caret in plain
 * text is inside no such node.
 */
function sourceRangeAt(
  state: MarkdownEditorState,
  offset: number
): { from: number; to: number } | null {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  const node = sourceNodeAt(state.getBlockContent(block), offset - block.charStart);
  const position = (
    node as { position?: { start?: { offset?: number }; end?: { offset?: number } } } | null
  )?.position;
  if (position?.start?.offset === undefined || position.end?.offset === undefined) {
    return null;
  }
  return {
    from: block.charStart + position.start.offset,
    to: block.charStart + position.end.offset
  };
}

/**
 * The node at this block-relative offset whose source can stand in for its
 * rendering, or null. The tree is walked in document order, so the outermost
 * such node wins: a caret inside a link inside a paragraph belongs to the link.
 */
function sourceNodeAt(nodes: RootContent[], offset: number): RootContent | null {
  for (const node of nodes) {
    const position = (node as { position?: { start?: { offset?: number } } }).position;
    if (position?.start?.offset === undefined || offset < position.start.offset) {
      continue;
    }
    const end = (node as { position?: { end?: { offset?: number } } }).position?.end?.offset;
    if (end !== undefined && offset > end) {
      continue;
    }
    if (showsSource(node.type)) {
      return node;
    }
    const children = (node as { children?: RootContent[] }).children;
    return Array.isArray(children) ? sourceNodeAt(children, offset) : null;
  }
  return null;
}

/** Where the caret goes after an edit: an offset, or one the new text decides. */
export type CaretTarget = number | ((state: MarkdownEditorState) => number);

/**
 * Remembers the shape the block's element was built from, and schedules the check
 * that a plain keystroke did not quietly change it.
 *
 * The rule (`syntax/plain_edit.ts`) refuses everything it is not sure of, but it
 * reads one word of the text while a markdown parse can turn on more than that,
 * and a keystroke it let through to a parse that changed would leave the element
 * showing the old shape until the next edit happened to rebuild it. So the shape
 * is captured here and compared with the parse the block has once the typing
 * stops; `renderBlock` then puts a block whose parse moved out from under it back
 * on screen, which is the repair and the parse the next edit will want.
 *
 * Capturing is free — it reads the parse the renderer already cached, the parse
 * the element was built from — and one check covers a burst: a keystroke replaces
 * the pending timer instead of queueing another, and keeps the shape it was
 * captured with. A block an ordinary edit rebuilt in between is then compared
 * with a shape it never had, which costs one render and cannot produce a wrong
 * page: the check only ever decides whether to render again from the document.
 */
function scheduleVerify(context: EditorContext, block: MarkdownBlock): void {
  const lineStart = block.lineStart;
  const pending = pendingFor(context);
  const waiting = pending.get(lineStart);
  const shape = waiting?.shape ?? nodeShape(context.state.getBlockContent(block));
  if (waiting) {
    clearTimeout(waiting.timer);
  }
  const timer = setTimeout(() => {
    pending.delete(lineStart);
    verifyBlock(context, lineStart, shape);
  }, VERIFY_DELAY_MS);
  pending.set(lineStart, { shape, timer });
}

/** The checks pending for this editor, creating the map on first use. */
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

/**
 * Applies a raw-text edit, re-syncs the rendered window and moves the caret.
 * Every command funnels through here so the change/render/caret sequence is
 * identical everywhere.
 */
export function applyEdit(
  context: EditorContext,
  from: number,
  to: number,
  replacement: string,
  caret: CaretTarget = from + replacement.length
): void {
  const anchor = context.contentView.scrollTop;
  const target = typeof caret === 'function' ? caret(context.state) : caret;
  // The fast path: a keystroke that cannot change how its block parses is written
  // into the text node the caret is in, and nothing is rendered or parsed — which
  // is what keeps the page's layout (and the 26 ms it costs to invalidate) out of a
  // typed character's way. Everything the rule or the mapping is unsure about falls
  // through to the ordinary path below, which is always correct.
  const rule = isPlainEdit(context.state.getText(), from, to, replacement);
  const root = rule ? proseRoot(context) : null;
  const run = root ? plainRun(context.state, root, from, to) : null;
  // The shape is captured before the edit is applied: afterwards the parse it
  // names is the one the edit replaced, and this block is being written into
  // without being built again (see `scheduleVerify`).
  const written = run ? context.state.getBlockAtOffset(from) : null;
  if (written) {
    scheduleVerify(context, written);
  }
  context.state.replaceRange(from, to, replacement);
  if (run) {
    writeRun(run, replacement);
    const block = context.state.getBlockAtOffset(from + replacement.length);
    if (block) {
      context.renderer.measureEditedBlock(block.lineStart);
    }
    // The caret is in the text node the write went into, and that node is the
    // document's own text (`plainRun` proved it): an edit the rule accepts cannot
    // move the caret into another node, so which source is shown cannot have
    // changed — asking would parse the block (see `source_mode.ts`, and the property
    // in `test/checks/check-plain-edit.mjs`). The range the edit did move is moved
    // with it, and the decision stays held while the caret is placed: placing it
    // notifies the caret observer (`markdown_editor.ts: followCaret`), which asks.
    moveShownSource({ from, to, replacement });
    withHeldShownSource(() => restoreCaret(context, target));
    keepScroll(context, anchor);
    return;
  }
  // The source the caret lands in is the source that is shown (see
  // `source_mode.ts`). Deciding that before the rebuild is what has the blocks
  // built in the shape the caret is about to need — and it is decided from the
  // document, so an edit inside a link or a formula keeps that source open
  // without an editing range to shift.
  showSourceAt(context, target);
  context.renderer.renderChanged();
  restoreCaret(context, target);
  keepScroll(context, anchor);
}

/**
 * Puts the scroll position back after an edit.
 *
 * Restoring the caret can make the browser scroll the focused element or the
 * synchronised selection into view — a scroll no seam in our code performs or
 * sees — and the reader ends up half a page away even though the document only
 * gained a line. The position is restored only when the caret is visible
 * there, so an edit that moves the caret out of the view still scrolls it in.
 */
export function keepScroll(context: EditorContext, anchor: number): void {
  const scroller = context.contentView;
  // Two frames: the caret is placed on the first, and the second is where the
  // browser has finished scrolling whatever it decided to scroll.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (Math.abs(scroller.scrollTop - anchor) < 1) {
        return;
      }
      const caret = getCaretRange();
      const box = scroller.getBoundingClientRect();
      if (!caret || !caret.startContainer.isConnected) {
        scroller.scrollTop = anchor;
        return;
      }
      // Where the caret would sit if the scroll went back to the anchor.
      const caretInContent = caret.getBoundingClientRect().top - box.top + scroller.scrollTop;
      const viewportY = caretInContent - anchor + box.top;
      if (viewportY >= box.top + 8 && viewportY <= box.bottom - 24) {
        scroller.scrollTop = anchor;
      }
    });
  });
}

/**
 * Places the caret at a document offset inside the rendered window. Returns
 * false when the offset lives in a block that is not mounted, so callers can
 * retry once that block comes back into the window. Offsets that fall between
 * blocks (the blank lines that separate them) snap to the nearest text, since
 * a separator has nothing to draw a caret on.
 */
export function restoreCaret(context: EditorContext, offset: number): boolean {
  const clamped = context.state.nearestTextOffset(offset);
  // The caret is going here, so the source it lands in is the one that is
  // shown — decided before the placement, so the caret lands on that text
  // exactly instead of being mapped into a rendering that cannot hold it.
  showSourceAt(context, clamped);
  return placeCaret(context, clamped);
}

/**
 * Places the caret at a document offset inside the rendered window, without
 * deciding what source that offset belongs to. Returns false when the offset
 * lives in a block that is not mounted.
 */
export function placeCaret(context: EditorContext, offset: number): boolean {
  const root = proseRoot(context);
  if (!root) {
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    return false;
  }
  const clamped = context.state.nearestTextOffset(offset);
  const position = domPositionAtOffset(context.state, root, clamped);
  if (!position) {
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    return false;
  }
  const caret = document.createRange();
  caret.setStart(position.node, position.offset);
  caret.collapse(true);
  setSelectionRange(null);
  window.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  scheduleCaret(caret);
  return true;
}
