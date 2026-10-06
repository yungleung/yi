/**
 * Writes a typed edit into the text node the caret is in, instead of rendering.
 *
 * A keystroke that cannot change how its block parses does not need a rendering at
 * all: the characters it inserted are the characters the document now holds, and
 * the text node that held the old ones holds the new ones. Writing them is what
 * keeps the block's element — and therefore the layout of everything below it —
 * exactly where it was (see `test/probes/block-rebuild-cost.js`: rebuilding the
 * fixture note's last block costs ~26 ms, writing into one of its text nodes ~0).
 *
 * It refuses whenever the mapping is not exact, and it decides that *before* the
 * edit is applied: both ends of the edit must land in one text node, that node must
 * be the only child of its `[data-text-from]` span, and the span's text must be the
 * document's own characters, one for one. Escapes, entities, hidden markers and
 * every widget that draws a *rendering* of its source fail that test, and the
 * caller renders the edit the ordinary way, which is always correct.
 *
 * Writing is also what moves the offsets the block's elements carry: they name
 * positions in the block's own text, so the ones after the edit move with the text
 * it gained (see `writeRun`).
 *
 * May import: the offset mapping (`caret/dom_position.ts`), the edit arithmetic
 * (`syntax/edit_range.ts`) and the state. Upholds: what is rendered is a function
 * of the document — this only ever writes characters the document already holds,
 * and every offset it moves is moved to where the text went.
 */

import { domPositionAtOffset } from '../caret/dom_position';
import { shiftOffset, type TextEdit } from '../syntax/edit_range';
import type { MarkdownEditorState } from '../document/state';
import { FORMAT_FROM, FORMAT_TO, SOURCE_FROM, TABLE_ROW_START, TASK_SOURCE_FROM, TEXT_FROM, offsetOf, setOffset, tagSelector } from './../offset_tags';

/** The rendered text a plain edit can be written into, and where in it. */
export interface TypedRun {
  node: Text;
  /** Offset in `node.data` where the replaced range starts. */
  start: number;
  /** Where it ends. */
  end: number;
  /** The same range as block-relative raw offsets, which is what the tags name. */
  from: number;
  to: number;
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
  const span = node.parentElement?.closest<HTMLElement>(`[data-${TEXT_FROM}]`) ?? null;
  if (!span || span.childNodes.length !== 1) {
    return null;
  }
  // The span spells out the document's own characters, from the offset it was
  // tagged with: that equality is what makes the write exact, and it is what
  // refuses a link's title, a citation's formatted reference, KaTeX, an entity and
  // an escaped character — none of which is the text the author typed.
  const text = state.getText();
  const tag = offsetOf(span, TEXT_FROM);
  const rawStart = block.charStart + tag;
  const raw = text.slice(rawStart, rawStart + span.textContent.length);
  if (!Number.isFinite(rawStart) || span.textContent !== raw) {
    return null;
  }
  return {
    node,
    start: start.offset,
    end: end.offset,
    from: tag + start.offset,
    to: tag + end.offset
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
 * range lives inside one text node.
 */
export function writeRun(run: TypedRun, inserted: string): void {
  run.node.data = `${run.node.data.slice(0, run.start)}${inserted}${run.node.data.slice(run.end)}`;
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
