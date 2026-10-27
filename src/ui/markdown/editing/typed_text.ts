/**
 * Writes a typed edit into the text node the caret is in, instead of rendering.
 *
 * A keystroke that maps exactly into rendered text does not need a rendering while it
 * is typed: the characters it inserted are the characters the document now holds, and
 * the text node that held the old ones holds the new ones. Writing them is what keeps
 * the block's element — and therefore the layout of everything below it — exactly
 * where it was (see `test/probes/block-rebuild-cost.js`: rebuilding the fixture note's
 * last block costs ~26 ms, writing into one of its text nodes ~0). A character that
 * may change the parse is checked once after the typing burst (`context.ts:
 * scheduleVerify`); the write itself never waits.
 *
 * It refuses whenever the mapping is not exact, and it decides that *before* the
 * edit is applied: both ends of the edit must land in one text node, and the text
 * run that node belongs to must be the document's own characters under the canonical
 * space rendering (`text_spacing.ts`), one source character for one displayed one.
 * An ordinary run is its `[data-text-from]` span with one child. A source view is
 * any `[data-source-from]` element, or a `.markdown-source-text` box, and may be
 * split across many highlighted nodes; it is accepted when its whole text is exact,
 * and the caret's node is edited without replacing the box. Escapes, entities,
 * hidden markers and every widget that draws a *rendering* of its source fail that
 * test, and the caller renders the edit the ordinary way, which is always correct.
 *
 * Writing is also what moves the offsets the block's elements carry: they name
 * positions in the block's own text, so the ones after the edit move with the text
 * it gained (see `writeRun`).
 *
 * May import: the offset mapping (`caret/dom_position.ts`), the edit arithmetic
 * (`syntax/edit_range.ts`), the one rendered-space mapping (`text_spacing.ts`) and
 * the state. Upholds: what is rendered is a function of the document — this only
 * ever writes characters the document already holds, and every offset it moves is
 * moved to where the text went.
 */

import { domPositionAtOffset } from '../caret/dom_position';
import { sourceTextOffset } from '../caret/offsets';
import { shiftOffset, type TextEdit } from '../syntax/edit_range';
import type { MarkdownEditorState } from '../document/state';
import { sourceTextAt } from '../source_text';
import { preserveSpaces } from '../text_spacing';
import { FORMAT_FROM, FORMAT_TO, SOURCE_FROM, TABLE_ROW_START, TASK_SOURCE_FROM, TEXT_FROM, offsetOf, setOffset, tagSelector } from './../offset_tags';

/** The rendered text a plain edit can be written into, and where in it. */
export interface TypedRun {
  node: Text;
  /** The document's raw text for the whole tagged run. */
  text: string;
  /** Offset in `node.data` where the replaced range starts. */
  start: number;
  /** Where it ends. */
  end: number;
  /** The same range as block-relative raw offsets, which is what the tags name. */
  from: number;
  to: number;
  /** Whether this is an exact source view, where every printable character is literal. */
  source: boolean;
}

/** The attributes whose value is a raw offset within the block. */
const MOVED_TAGS = [TEXT_FROM, SOURCE_FROM, FORMAT_FROM, FORMAT_TO, TABLE_ROW_START, TASK_SOURCE_FROM] as const;

/** The elements that carry one of them. */
const TAGGED = tagSelector(...MOVED_TAGS);

/**
 * The text node this edit can be written into, or null when the mapping is not
 * exact. `from`/`to` are offsets in the text the state holds *before* the edit.
 */
export function plainRun(
  state: MarkdownEditorState,
  root: HTMLElement,
  from: number,
  to: number
): TypedRun | null {
  const block = state.getBlockAtOffset(from);
  if (!block) {
    return null;
  }
  const start = domPositionAtOffset(state, root, from);
  const end = domPositionAtOffset(state, root, to);
  if (!start || !end || start.node !== end.node || start.node.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const node = start.node as Text;
  const source = sourceTextAt(node);
  const span =
    source ?? node.parentElement?.closest<HTMLElement>(`[data-${TEXT_FROM}]`) ?? null;
  if (!span || (source === null && span.childNodes.length !== 1)) {
    return null;
  }
  // The span is the document's text under its canonical space rendering, from the
  // offset it was tagged with: that equality is what makes the write exact, and it is what
  // refuses a link's title, a citation's formatted reference, KaTeX, an entity and
  // an escaped character — none of which is the text the author typed.
  const text = state.getText();
  const sourceFrom = offsetOf(span, SOURCE_FROM);
  const tag = Number.isFinite(sourceFrom) ? sourceFrom : offsetOf(span, TEXT_FROM);
  const rawStart = block.charStart + tag;
  const raw = text.slice(rawStart, rawStart + span.textContent.length);
  const rendered = source === null ? preserveSpaces(raw) : raw;
  if (!Number.isFinite(rawStart) || span.textContent !== rendered) {
    return null;
  }
  // Highlighting makes one source box many text nodes. Its text still spells the block's
  // source exactly, so the write can stay in the node the caret is in and leave the source
  // box mounted. This is the same proof as the single-node path, made over the whole box.
  const startWithin = sourceTextOffset(span, node, start.offset);
  const endWithin = sourceTextOffset(span, node, end.offset);
  if (startWithin === null || endWithin === null) {
    return null;
  }
  return {
    node,
    text: raw,
    start: start.offset,
    end: end.offset,
    from: tag + startWithin,
    to: tag + endWithin,
    source: source !== null
  };
}

/**
 * Writes the replacement into the run, which `plainRun` has already vouched for,
 * and moves the offsets the block's elements carry to match.
 *
 * A tag names where its element's own text starts in the block, so the characters
 * this write added before it move it, and the element the caret is in does not move
 * at all: the edit is inside its text. Where an offset ends up is
 * `syntax/edit_range.ts: shiftOffset`, the rule the caret and the table commands
 * already share, and a tag strictly inside the replaced range cannot happen — the
 * range lives inside one text node. Ordinary prose is written through
 * `text_spacing.ts` so a newly trailing or repeated space is visible immediately.
 */
export function writeRun(run: TypedRun, inserted: string): void {
  const local = `${run.node.data.slice(0, run.start)}${inserted}${run.node.data.slice(run.end)}`;
  const raw = `${run.text.slice(0, run.start)}${inserted}${run.text.slice(run.end)}`;
  run.node.data = run.source ? local : preserveSpaces(raw);
  const blockElement = run.node.parentElement?.closest<HTMLElement>('.markdown-block') ?? null;
  if (!blockElement) {
    return;
  }
  const edit: TextEdit = { from: run.from, to: run.to, replacement: inserted };
  for (const element of blockElement.querySelectorAll<HTMLElement>(TAGGED)) {
    for (const tag of MOVED_TAGS) {
      const offset = offsetOf(element, tag);
      if (Number.isFinite(offset)) {
        setOffset(element, tag, shiftOffset(offset, edit));
      }
    }
  }
}
