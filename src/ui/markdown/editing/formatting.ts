/**
 * Inline formatting commands (bold, italic, strikethrough, inline code).
 *
 * A formatting edit only adds or removes marker characters, so the rendered
 * block is patched in place when possible — re-rendering a block costs far
 * more because it rebuilds every widget inside it. Selections the patch
 * cannot represent fall back to re-rendering the affected block(s).
 *
 * May import: the caret's selection and offsets (`caret/caret.ts`,
 * `caret/offsets.ts`, `caret/dom_position.ts`), the pure formatting rules
 * (`format.ts`), the DOM patch (`format_dom.ts`) and the editing context.
 * Upholds: the document text is the only source of truth — the patch mirrors the
 * edit that was made to the text, and a selection it cannot mirror is rendered
 * again instead.
 */

import { getSelectionRange } from '../caret/caret';
import { documentOffsetAt } from '../caret/offsets';
import { formatRange, type FormattingStyle, type FormatUnit } from '../format';
import { patchFormatDom } from '../format_dom';
import { restoreSelection, type EditorContext } from './context';
import { proseRoot } from './selection';
import { FORMAT_FROM, FORMAT_TO, LINE_START, TEXT_FROM, offsetOf } from './../offset_tags';

/** Applies a formatting style to the current selection. */
export function applyFormatting(context: EditorContext, style: FormattingStyle): void {
  const range = getSelectionRange();
  if (!range || range.collapsed) {
    return;
  }
  const start = documentOffsetAt(context.state, range.startContainer, range.startOffset);
  const end = documentOffsetAt(context.state, range.endContainer, range.endOffset);
  if (!start || !end || start.offset === end.offset) {
    return;
  }
  const text = context.state.getText();
  let from = Math.min(start.offset, end.offset);
  let to = Math.max(start.offset, end.offset);
  // Natural drags often include adjacent whitespace; ignore it so the
  // formatting targets exactly the selected content.
  while (from < to && /\s/.test(text[from])) {
    from += 1;
  }
  while (to > from && /\s/.test(text[to - 1])) {
    to -= 1;
  }
  if (from === to) {
    return;
  }
  // A selection covering a whole formatted unit (e.g. the entire content of
  // `***x***` or of an inline code span) formats the whole unit, so stacked
  // styles can be toggled off in any order and a new style wraps the unit.
  const unit = coveredFormattingUnit(context, range, range.toString().trim());
  const unitRange = unit ? unitRangeOf(context, unit) : undefined;
  const edit = formatRange(text, from, to, style, unitRange);
  // The whole document is one edit, and it remembers its author: the selection it
  // formatted — which undo puts back, so the style can be toggled off where it was
  // applied — and the span it leaves, which it selects again below.
  context.state.setText(edit.text, {
    before: { from, to },
    after: { from: edit.from, to: edit.to }
  });

  const root = proseRoot(context);
  // The blocks the edit left behind, asked for by offset. A block object from *before*
  // the edit cannot be asked where it sits: a block's positions come from the document's
  // index (`document/blocks.ts`, `document/block_index.ts`), the whole-document edit
  // re-split the blocks, and the index answers for a block it no longer holds with an
  // error rather than with a position that belongs to another block. These are the same
  // two offsets the patch reads its own block from.
  const first = context.state.getBlockAtOffset(edit.wrapFrom);
  const last = context.state.getBlockAtOffset(edit.wrapTo);
  const sameBlock = first !== null && last !== null && first.lineStart === last.lineStart;
  const patched = sameBlock && root !== null && patchFormatDom(context.state, root, style, edit);
  if (patched && first !== null) {
    // The patch wrote the block's markup where the renderer could not see it, so the
    // renderer is told what its element now holds: without that, an edit back to the
    // older text (an undo) looks like nothing to re-render, and the padded markup stays
    // on screen with the selection mapped through it.
    context.renderer.notePatchedBlock(first.lineStart);
  } else if (first !== null) {
    context.renderer.renderBlock(first.lineStart);
    if (last !== null && last.lineStart !== first.lineStart) {
      context.renderer.renderBlock(last.lineStart);
    }
  }
  context.renderer.refreshBlockTags();
  // The formatted range is selected again, and the caret anchored at its end, so
  // further formatting can be applied in sequence.
  restoreSelection(context, edit.from, edit.to);
}

/**
 * The outermost inline formatting element (em/strong/del/code) whose rendered
 * content the selection anchors to — the selection equals it, or starts/ends
 * at its edges and extends past it with adjacent characters (natural drags
 * include them). A partial selection inside a unit formats only what is
 * selected. The raw range of the whole unit (including its hidden markers) is
 * then the edit target.
 */
function coveredFormattingUnit(
  context: EditorContext,
  range: Range,
  selectedText: string
): HTMLElement | null {
  const anchored = (element: Element): boolean => {
    const content = element.textContent ?? '';
    return (
      content.length > 0 &&
      (selectedText === content ||
        selectedText.startsWith(content) ||
        selectedText.endsWith(content))
    );
  };
  const candidates: HTMLElement[] = [];
  // Units inside the selection's subtree (a selection extending past a unit
  // has the containing paragraph as its common ancestor).
  const scan = (root: Node): void => {
    if (root.nodeType === Node.ELEMENT_NODE) {
      const element = root as Element;
      if (element.hasAttribute('data-format-from') && anchored(element)) {
        candidates.push(element as HTMLElement);
      }
      for (const child of element.children) {
        scan(child);
      }
    }
  };
  scan(range.commonAncestorContainer);
  // Units on the ancestor chain (a selection inside a unit's text).
  let node: Node | null = range.commonAncestorContainer.parentNode;
  while (node && node !== context.contentView) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).hasAttribute('data-format-from') &&
      anchored(node as Element)
    ) {
      candidates.push(node as HTMLElement);
    }
    node = node.parentNode;
  }
  // The outermost candidate (the one containing the others).
  return (
    candidates.find((candidate) =>
      candidates.every((other) => candidate === other || candidate.contains(other))
    ) ?? null
  );
}

/** The raw range of a formatting unit and of its rendered text. */
function unitRangeOf(context: EditorContext, unit: HTMLElement): FormatUnit {
  // The tags are block-relative; the global offsets add the block's charStart
  // (refreshed on every edit).
  const blockElement = unit.closest('.markdown-block') as HTMLElement | null;
  const block = blockElement
    ? context.state.getBlocks().find((b) => b.lineStart === offsetOf(blockElement, LINE_START))
    : null;
  const base = block?.charStart ?? 0;
  const textSpans = unit.querySelectorAll<HTMLElement>(`[data-${TEXT_FROM}]`);
  const first = textSpans[0];
  const last = textSpans[textSpans.length - 1];
  return {
    from: base + offsetOf(unit, FORMAT_FROM),
    to: base + offsetOf(unit, FORMAT_TO),
    contentFrom: first ? base + offsetOf(first, TEXT_FROM) : base + offsetOf(unit, FORMAT_FROM),
    contentTo: last
      ? base + offsetOf(last, TEXT_FROM) + (last.firstChild as Text).data.length
      : base + offsetOf(unit, FORMAT_TO)
  };
}
