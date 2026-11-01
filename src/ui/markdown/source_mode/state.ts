/**
 * Mutable source-mode state: the shown range, held decisions and render frame.
 *
 * Example: shifting `{ from: 10, to: 20 }` by a two-character insertion at 5 produces
 * `{ from: 12, to: 22 }`, keeping the source view on the same document text.
 *
 * May import: block types and edit arithmetic. Upholds: source mode follows the document by
 * offsets; rendering never stores DOM as a second source of truth.
 */

import type { MarkdownBlock } from '../document/blocks';
import { shiftOffset, shiftRangeEnd, type TextEdit } from '../syntax/edit_range';

let shownRange: { from: number; to: number } | null = null;
let held = 0;
let renderFrame: MarkdownBlock | null = null;

/** The range currently shown as source. Internal to the source-mode domain. */
export function currentShownRange(): { from: number; to: number } | null {
  return shownRange;
}

/** Moves the shown range with an ordinary text edit. */
export function moveShownSource(edit: TextEdit): void {
  if (!shownRange) {
    return;
  }
  const from = shiftOffset(shownRange.from, edit);
  shownRange = { from, to: Math.max(from, shiftRangeEnd(shownRange.to, edit)) };
}

/** Moves the shown range for two formatting edits at the range edges. */
export function moveShownSourceForFormatting(
  from: number,
  to: number,
  delta: number
): void {
  if (!shownRange) {
    return;
  }
  const move = (offset: number): number => {
    if (offset <= from) {
      return offset;
    }
    return offset >= to ? offset + delta : from;
  };
  const movedFrom = move(shownRange.from);
  shownRange = {
    from: movedFrom,
    to: Math.max(movedFrom, move(shownRange.to))
  };
}

/**
 * Whether an edit belongs strictly inside the shown source.
 *
 * Example: typing an ordinary character inside a link stays in source mode; typing just after its
 * closing `)` may complete surrounding prose and therefore follows the normal rebuild path.
 */
export function editStaysInsideShownSource(
  edit: TextEdit,
  growth: { start: boolean; end: boolean } = { start: false, end: false }
): boolean {
  if (!shownRange || edit.from < shownRange.from || edit.to > shownRange.to) {
    return false;
  }
  if (edit.from > shownRange.from && edit.to < shownRange.to) {
    return true;
  }
  const insertion = edit.from === edit.to && edit.replacement.length > 0;
  if (!insertion) {
    return false;
  }
  return (
    (edit.from === shownRange.from && growth.start) ||
    (edit.from === shownRange.to && growth.end)
  );
}

/** Holds source-mode decisions while a known-stable build runs. */
export function withHeldShownSource<T>(build: () => T): T {
  held += 1;
  try {
    return build();
  } finally {
    held -= 1;
  }
}

/** Whether a known-stable source decision is being held. */
export function shownSourceHeld(): boolean {
  return held > 0;
}

/** Replaces the shown range and reports whether its offsets changed. */
export function setShownRange(range: { from: number; to: number } | null): boolean {
  if (
    (range?.from ?? null) === (shownRange?.from ?? null) &&
    (range?.to ?? null) === (shownRange?.to ?? null)
  ) {
    return false;
  }
  shownRange = range;
  return true;
}

/** Builds a block with that block available as the current render frame. */
export function withRenderFrame<T>(block: MarkdownBlock, build: () => T): T {
  const previous = renderFrame;
  renderFrame = block;
  try {
    return build();
  } finally {
    renderFrame = previous;
  }
}

/** The block whose element is being built, or null outside a render pass. */
export function renderingBlock(): MarkdownBlock | null {
  return renderFrame;
}
