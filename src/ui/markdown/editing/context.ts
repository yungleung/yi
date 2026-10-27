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
 * `caret/dom_position.ts`), the renderer, the state, `source_mode.ts`, the
 * syntax rules it reads (`syntax/plain_edit.ts`, `syntax/node_shape.ts`, and
 * `syntax/footnotes.ts` for the shape of a definition's label), and the app's
 * hint surface and words for the pinned frontmatter id. Upholds: every
 * command funnels its change through `applyEdit`, so the change → re-render →
 * place-the-caret sequence is identical everywhere.
 */

import {
  getCaretRange,
  getSelectionRange,
  scheduleCaret,
  scheduleNativeSelection,
  setSelectionRange
} from '../caret/caret';
import { moveShownSource, setShownRange, shownSourceHeld, withHeldShownSource } from '../source_mode';
import { documentOffsetAt } from '../caret/offsets';
import { domPositionAtOffset } from '../caret/dom_position';
import { showsSource } from '../registry';
import { markerShape } from '../syntax/footnotes';
import { isInPlaceTextEdit, isPlainEdit } from '../syntax/plain_edit';
import { nodeShape } from '../syntax/node_shape';
import { plainRun, writeRun } from './typed_text';
import { editorSelection, proseRoot, rangeOffsets } from './selection';
import type { EditKind, EditMark } from '../document/history';
import type { RootContent } from 'mdast';
import type { AstHeading } from '../ast';
import { hasSourceMode } from '../document/block_kinds';
import type { MarkdownBlock } from '../document/blocks';
import type { EditCaret, MarkdownEditorState } from '../document/state';
import { editsId } from './id_lock';
import { showHint } from '../../../services/hints';
import { t } from '../../../services/i18n';
import type { VirtualBlockRenderer } from '../virtual_block_renderer';

/** What every editing command needs to read and change the document. */
export interface EditorContext {
  readonly state: MarkdownEditorState;
  readonly renderer: VirtualBlockRenderer;
  readonly contentView: HTMLElement;
  /**
   * Told after every edit, so whatever keeps a copy of the document — the session that holds
   * the stack — can follow it. It carries nothing: the text is the state's, and a listener
   * that wants it reads it then.
   */
  readonly onChanged?: (kind: EditKind) => void;
  /**
   * Puts the keyboard where the text is.
   *
   * The editor's own seam holds it (`composition_input.ts`), so a command that wants the
   * keyboard asks for *this* rather than focusing the prose root: the seam would take the
   * focus from the root a moment later anyway, and that second change is what drops a
   * selection the command has just made (`clipboard.ts: selectAll`).
   */
  readonly focusText: () => void;
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
 * Where the author is, as the mark an edit remembers: the range they have selected, or
 * the caret when the range is collapsed. It reads the same selection the commands edit,
 * through the same mapping (`rangeOffsets`), so what an edit remembers and what it
 * replaces cannot disagree.
 */
function authorMark(context: EditorContext): EditMark | null {
  const range = editorSelection(context, true);
  return range ? rangeOffsets(context, range) : null;
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
  // A *selection* is the reader acting on text they can see, not a caret entering the markdown they
  // are editing: a fenced block is built as its own text — delimiters and all — when the caret is
  // inside, and that build would take the selected text with the element it replaces (a new note
  // opens with its title selected, and the title is inside a frontmatter block). So the source a
  // decision asked for while a selection is live names the *node* the caret is in and never the
  // block, which leaves a block that is not showing its text in the shape it has; a block that *is*
  // showing its own text is left in it by the caret observer, which holds that one ask back while a
  // selection is live (`markdown_editor.ts: followCaret`).
  const selecting = getSelectionRange() !== null;
  const range = offset === null ? null : sourceRangeAt(context.state, offset, selecting);
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
 * The source a caret at this document offset is inside, as its own range: a
 * fenced block's own text while the caret is in it and the reader is not
 * selecting (`selecting`), or the node the caret is in when that node has a
 * source to show. A caret in plain text is inside no such source.
 */
function sourceRangeAt(
  state: MarkdownEditorState,
  offset: number,
  selecting: boolean
): { from: number; to: number } | null {
  const block = state.getBlockAtOffset(offset);
  if (!block) {
    return null;
  }
  // A fenced block is the source the caret is in: its rendering is the body with the delimiters
  // hidden (`nodes/fence_text.ts`), so the text that stands in for that rendering is the block's
  // own — delimiters and all — and every offset in the block maps through it.
  if (!selecting && hasSourceMode(block.kind)) {
    return { from: block.charStart, to: block.charEnd };
  }
  const range = sourceRangeIn(state.getBlockContent(block), offset - block.charStart);
  return range === null
    ? null
    : { from: block.charStart + range.start, to: block.charStart + range.end };
}

/**
 * The source at this block-relative offset whose markdown can stand in for its
 * rendering, as its range in the block's own text, or null. The tree is walked in
 * document order, so the outermost such node wins: a caret inside a link inside a
 * paragraph belongs to the link.
 *
 * A definition's label is the one source that is not a whole node: the node's range
 * covers the note as well as its marker, and the note's text is rendered and editable
 * where it sits, so only the `[^label]` at the definition's head is asked for by name
 * (see `syntax/footnotes.ts: markerShape`).
 */
function sourceRangeIn(
  nodes: RootContent[],
  offset: number
): { start: number; end: number } | null {
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
      return end === undefined ? null : { start: position.start.offset, end };
    }
    if (node.type === 'table' && node.tableCaption) {
      const caption = node.tableCaption.captionData;
      return offset >= caption.captionFrom && offset <= caption.captionTo
        ? { start: caption.captionFrom, end: caption.captionTo }
        : null;
    }
    if (node.type === 'list' && node.listCaption) {
      const caption = node.listCaption.captionData;
      if (offset >= caption.captionFrom && offset <= caption.captionTo) {
        return { start: caption.captionFrom, end: caption.captionTo };
      }
      return sourceRangeIn((node as { children?: RootContent[] }).children ?? [], offset);
    }
    if (node.type === 'footnoteDefinition') {
      const label = String((node as { label?: string }).label ?? '');
      const marker = markerShape(label);
      return offset < position.start.offset + marker.end
        ? { start: position.start.offset, end: position.start.offset + marker.end }
        : null;
    }
    if (node.type === 'heading') {
      const attributes = (node as AstHeading).headingAttributes;
      return attributes && end !== undefined && offset <= end
        ? { start: attributes.from, end: attributes.to }
        : null;
    }
    const children = (node as { children?: RootContent[] }).children;
    return Array.isArray(children) ? sourceRangeIn(children, offset) : null;
  }
  return null;
}

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
function scheduleVerify(
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
      // block's own text did not move (a footnote marker becomes plain text when its
      // definition disappears). Reconcile every block that shares this document once
      // the burst ends. The edited source block still matches the key recorded by
      // `measureEditedBlock`, so it remains mounted; its own parse waits until the
      // caret leaves.
      context.renderer.renderChanged();
    } else {
      verifyBlock(context, lineStart, shape);
    }
  }, VERIFY_DELAY_MS);
  pending.set(lineStart, { shape, syncDependents, timer });
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
  caret: EditCaret = from + replacement.length,
  kind: EditKind = 'other'
): void {
  if (editsId(context.state.getText(), from, to)) {
    // Refusing the write still consumes the keystroke: the editor's text is the truth, and a
    // native insertion after this return would be the very edit the pin exists to stop.
    showHint(t('session.idLocked'), null);
    return;
  }
  const anchor = context.contentView.scrollTop;
  // Where the author was before the edit — a caret, or the selection this edit is about
  // to replace. The history keeps it (`history.ts: EditMark`), so undo can put the
  // author back there rather than wherever they are when the undo is asked for: a
  // selection comes back selected, ready to be typed over.
  const before = authorMark(context) ?? { from, to: from };
  // The fast path: a keystroke that cannot change how its block parses is written
  // into the text node the caret is in, and nothing is rendered or parsed — which
  // is what keeps the page's layout (and the 26 ms it costs to invalidate) out of a
  // typed character's way. Everything the rule or the mapping is unsure about falls
  // through to the ordinary path below, which is always correct.
  const editBlock = context.state.getBlockAtOffset(from);
  const literal =
    editBlock?.kind === 'fencedCode' ||
    editBlock?.kind === 'displayMath' ||
    editBlock?.kind === 'equation';
  const beforeText = context.state.getText();
  const rule = isPlainEdit(beforeText, from, to, replacement, literal);
  const root = proseRoot(context);
  const candidate = root ? plainRun(context.state, root, from, to) : null;
  // A source view, ordinary keyboard typing and an input-method commit on one exact
  // text node all write the document's own characters directly. Prose may temporarily
  // show a marker literally; the deferred shape check renders it once input settles.
  const direct =
    candidate !== null &&
    (candidate.source
      ? isInPlaceTextEdit(beforeText, from, to, replacement)
      : rule ||
        ((kind === 'typing' || kind === 'commit') &&
          replacement !== '' &&
          isInPlaceTextEdit(beforeText, from, to, replacement)));
  const run = direct ? candidate : null;
  // The shape is captured before the edit is applied: afterwards the parse it
  // names is the one the edit replaced, and this block is being written into
  // without being built again (see `scheduleVerify`).
  const written = run ? context.state.getBlockAtOffset(from) : null;
  if (written) {
    scheduleVerify(context, written, run?.source === true);
  }
  // The caret is resolved against the *edited* text (`state.ts: EditCaret`): asking a
  // rule like `Enter`'s what it names before the edit names the block the key was
  // pressed in, not the empty paragraph the edit made.
  const target = context.state.replaceRange(from, to, replacement, { before, caret, kind });
  if (run) {
    writeRun(run, replacement);
    // The shown range names document offsets, so it has to move before the block is measured:
    // measuring records the DOM's current rendering identity, and a shrinking edit whose old
    // end still lies past the new block end would record the rendered shape while the source
    // view is still mounted.
    moveShownSource({ from, to, replacement });
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
    withHeldShownSource(() => restoreCaret(context, target));
    keepScroll(context, anchor);
    context.onChanged?.(kind);
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
  context.onChanged?.(kind);
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
export function restoreCaret(context: EditorContext, offset: number, scroll = true): boolean {
  const clamped = context.state.nearestTextOffset(offset);
  // The caret is going here, so the source it lands in is the one that is
  // shown — decided before the placement, so the caret lands on that text
  // exactly instead of being mapped into a rendering that cannot hold it.
  showSourceAt(context, clamped);
  return placeCaret(context, clamped, scroll);
}

/**
 * Puts the author back where an edit's mark says: a caret, or — when the edit replaced
 * a selection — that selection again, so the text it covered can be typed over rather
 * than having to be selected a second time. A selection whose far end is not on screen
 * cannot be drawn, and then the caret at the end it can reach is the honest fallback.
 */
export function restoreMark(context: EditorContext, mark: EditMark, scroll = true): boolean {
  if (mark.from === mark.to) {
    return restoreCaret(context, mark.from, scroll);
  }
  return restoreSelection(context, mark.from, mark.to, scroll) || restoreCaret(context, mark.to, scroll);
}

/**
 * Selects a document range in the rendered window, with the caret anchored at its end
 * so the next command has somewhere to start.
 *
 * The editor's own selection state is updated synchronously, so the command that
 * follows sees it immediately; only the visible highlight and the caret geometry are
 * deferred, because forcing a selection paint costs a frame on a large document (see
 * `caret.ts: scheduleNativeSelection`). This is what a formatting command does to the
 * text it just formatted, and what an undo does to the text it just put back.
 */
export function restoreSelection(
  context: EditorContext,
  from: number,
  to: number,
  scroll = true
): boolean {
  const root = proseRoot(context);
  if (!root) {
    return false;
  }
  const start = domPositionAtOffset(context.state, root, from);
  const end = domPositionAtOffset(context.state, root, to);
  if (!start || !end) {
    return false;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const caret = document.createRange();
  caret.setStart(end.node, end.offset);
  caret.collapse(true);
  setSelectionRange(range);
  scheduleCaret(caret, scroll);
  scheduleNativeSelection(range);
  return true;
}

/**
 * Places the caret at a document offset inside the rendered window, without
 * deciding what source that offset belongs to. Returns false when the offset
 * lives in a block that is not mounted.
 */
export function placeCaret(context: EditorContext, offset: number, scroll = true): boolean {
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
  context.focusText();
  scheduleCaret(caret, scroll);
  return true;
}
