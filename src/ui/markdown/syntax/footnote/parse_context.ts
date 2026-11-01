/**
 * Supplies block parsing with footnote definitions borrowed from the rest of the document.
 *
 * Example: parsing `Text[^1]` with `{'1'}` appends `[^1]: x`, so remark emits a reference; nodes
 * from that appended line are then dropped because they start beyond the block's own text.
 *
 * May import: the footnote model. Upholds: borrowed definitions never change offsets in the
 * caller's text and definitions already present in the block are not appended twice.
 */

import { footnoteDefinitionLabels, footnoteReferenceLabels } from './model';

/** The parse input for a block, with the definitions its references need. */
export function withFootnoteDefinitions(
  blockText: string,
  defined: ReadonlySet<string>
): string {
  if (defined.size === 0) {
    return blockText;
  }
  const definedHere = new Set(footnoteDefinitionLabels(blockText));
  const needed = new Set<string>();
  for (const label of footnoteReferenceLabels(blockText)) {
    if (defined.has(label) && !definedHere.has(label)) {
      needed.add(label);
    }
  }
  if (needed.size === 0) {
    return blockText;
  }
  return `${blockText}${[...needed].map((label) => `\n\n[^${label}]: x`).join('')}`;
}

/**
 * Whether a node belongs to the caller's own text rather than the appended definitions.
 *
 * Example: with a 10-character block, a node starting at 12 came from the borrowed suffix and is
 * dropped; a node with no position is kept because it cannot be attributed to that suffix.
 */
export function isOwnNode(node: unknown, length: number): boolean {
  const start = (node as { position?: { start?: { offset?: number } } }).position?.start?.offset;
  return start === undefined || start < length;
}
