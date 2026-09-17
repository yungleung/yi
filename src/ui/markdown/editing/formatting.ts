/**
 * Inline formatting commands (bold, italic, strikethrough, inline code).
 *
 * A formatting edit only adds or removes marker characters, so the rendered
 * block is patched in place when possible — re-rendering a block costs far
 * more because it rebuilds every widget inside it. Selections the patch
 * cannot represent fall back to re-rendering the affected block(s).
 */

import { getSelectionRange, scheduleCaret, scheduleNativeSelection, setSelectionRange } from '../caret/caret';
import { documentOffsetAt, domPositionAtOffset } from '../position';
import { formatRange, type FormatUnit } from '../format';
import { patchFormatDom } from '../format_dom';
import type { FormattingStyle } from '../../formatting_toolbar';
import { proseRoot, type EditorContext } from './context';

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
  context.state.setText(edit.text);

  const root = proseRoot(context);
  const sameBlock = start.block.lineStart === end.block.lineStart;
  const patched = sameBlock && root !== null && patchFormatDom(context.state, root, style, edit);
  if (!patched) {
    context.renderer.renderBlock(start.block.lineStart);
    if (!sameBlock) {
      context.renderer.renderBlock(end.block.lineStart);
    }
  }
  context.renderer.refreshBlockTags();
  restoreSelection(context, edit.from, edit.to);
}

/**
 * Re-selects the formatted range in the re-rendered document and anchors the
 * caret at its end, so further formatting can be applied in sequence.
 */
function restoreSelection(context: EditorContext, from: number, to: number): void {
  const root = proseRoot(context);
  if (!root) {
    return;
  }
  const startPos = domPositionAtOffset(context.state, root, from);
  const endPos = domPositionAtOffset(context.state, root, to);
  if (!startPos || !endPos) {
    return;
  }
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  const caret = document.createRange();
  caret.setStart(endPos.node, endPos.offset);
  caret.collapse(true);
  // The editor's selection state is updated synchronously so the next
  // formatting command sees it immediately; only the visible highlight and
  // the caret geometry are deferred (both are expensive to apply right after
  // the block re-render).
  setSelectionRange(range);
  scheduleCaret(caret);
  scheduleNativeSelection(range);
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
    ? context.state.getBlocks().find((b) => String(b.lineStart) === blockElement.dataset.lineStart)
    : null;
  const base = block?.charStart ?? 0;
  const textSpans = unit.querySelectorAll<HTMLElement>('[data-text-from]');
  const first = textSpans[0];
  const last = textSpans[textSpans.length - 1];
  return {
    from: base + Number(unit.dataset.formatFrom),
    to: base + Number(unit.dataset.formatTo),
    contentFrom: first ? base + Number(first.dataset.textFrom) : base + Number(unit.dataset.formatFrom),
    contentTo: last
      ? base + Number(last.dataset.textFrom) + (last.firstChild as Text).data.length
      : base + Number(unit.dataset.formatTo)
  };
}
