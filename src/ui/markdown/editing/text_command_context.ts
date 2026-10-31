/**
 * Resolves the block a rendered text caret belongs to before a text command
 * changes the source.
 *
 * Example: at a shared boundary between a blank block and the paragraph above,
 * the DOM line under the caret wins over the equal document offset.
 *
 * May import: only the shared edit-context type. Upholds: text commands use the
 * visibly named block first and the document-offset lookup only as fallback.
 */

import type { EditorContext } from './context';

export function blockAtCaret(
  context: EditorContext,
  range: Range,
  offset: number
) {
  const start = range.startContainer;
  const element =
    start.nodeType === Node.ELEMENT_NODE
      ? (start as Element)
      : start.parentElement;
  const blockElement = element?.closest<HTMLElement>('.markdown-block') ?? null;
  const lineStart = Number(blockElement?.dataset.lineStart);
  const block = Number.isFinite(lineStart)
    ? context.state.getBlockAtLine(lineStart)
    : null;
  return block ?? context.state.getBlockAtOffset(offset);
}
