/**
 * Toggles a rendered task-list checkbox by rewriting its source marker.
 *
 * Example: pressing `[ ]` changes it to `[x]`, rebuilds the list, and leaves the
 * caret where the reader had it.
 *
 * May import: the edit context and caret helpers. Upholds: only a task marker
 * belonging to the rendered checkbox's block changes, and the document remains
 * the source of truth.
 */

import { caretOffset, restoreCaret, type EditorContext } from './context';

export function toggleTask(context: EditorContext, checkbox: HTMLInputElement): boolean {
  const item = checkbox.closest<HTMLElement>('[data-task-source-from]');
  const blockElement = item?.closest<HTMLElement>('.markdown-block');
  const relativeStart = Number(item?.dataset.taskSourceFrom);
  if (!item || !blockElement || !Number.isFinite(relativeStart)) {
    return false;
  }
  const block = context.state.getBlockAtLine(Number(blockElement.dataset.lineStart));
  if (!block) {
    return false;
  }
  const source = context.state.getText();
  const lineStart = block.charStart + relativeStart;
  const lineEnd = source.indexOf('\n', lineStart);
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
  const marker = /^(\s*(?:[-+*]|\d+[.)])\s+)\[([ xX])\]/.exec(line);
  if (!marker) {
    return false;
  }
  const markerOffset = lineStart + marker[1].length;
  const previousCaret = caretOffset(context);
  context.state.replaceRange(
    markerOffset + 1,
    markerOffset + 2,
    marker[2].toLowerCase() === 'x' ? ' ' : 'x'
  );
  context.renderer.renderChanged();
  if (previousCaret !== null) {
    restoreCaret(context, previousCaret > markerOffset ? previousCaret : markerOffset + 3);
  }
  return true;
}
