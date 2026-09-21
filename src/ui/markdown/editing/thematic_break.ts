/**
 * The thematic break: a `---` line where the caret is, standing on its own.
 *
 * A rule is a *block*, not a character: markdown reads `---` glued under a line
 * of text as a setext heading, so the line needs a blank line on each side of
 * it. That is a rule about markdown, so the padding comes from
 * `blank_lines.ts` and the marker from `syntax/markers.ts` — this module only
 * decides where they go and applies the one edit.
 *
 * May import: the marker's home (`syntax/markers.ts`), the blank-line rule
 * beside it (`./blank_lines`) and the editing context. Upholds: the document
 * text is the only source of truth — one `applyEdit` writes the rule, and the
 * caret is placed by offset from the blocks the edit leaves behind.
 */

import { thematicBreakMarker } from '../syntax/markers';
import { blockPadding } from './blank_lines';
import { applyEdit, caretOffset, type EditorContext } from './context';

/**
 * The markdown a thematic break needs to stand on its own at `offset`: the
 * marker, with the blank line each side of it is missing added around it.
 */
export function thematicBreakInsertion(text: string, offset: number): string {
  const padding = blockPadding(text, offset);
  return `${padding.leading}${thematicBreakMarker}${padding.trailing}`;
}

/** Writes a thematic break at the caret, which ends up on the line below it. */
export function insertThematicBreak(context: EditorContext): boolean {
  const caret = caretOffset(context);
  if (caret === null) {
    return false;
  }
  const text = context.state.getText();
  const insertion = thematicBreakInsertion(text, caret);
  const ruleEnd = caret + insertion.indexOf(thematicBreakMarker) + thematicBreakMarker.length;
  applyEdit(context, caret, caret, insertion, (state) => {
    // The caret goes to the line *under* the rule: the block that starts after
    // it, or the end of the document when the rule is the last thing there is.
    // The blank line between two blocks is not a place a caret can be, and the
    // end of the `---` line is worse than that — the next keystroke would join
    // the marker and take the rule with it.
    const next = state.getBlocks().find((block) => block.charStart >= ruleEnd);
    return next ? next.charStart : state.getText().length;
  });
  return true;
}
