/**
 * The stable editing-context facade and the one sequence every command edit follows.
 *
 * `applyEdit` is the shared write path: document text changes first, then the edited block is
 * measured or rebuilt, the caret is restored, and scroll is held. Source and caret rules live in
 * focused children but remain exported from here so command modules keep one import boundary.
 *
 * Example: typing `x` on the fast path writes the text node and restores the caret without a parse;
 * Enter may rebuild the block, but both return with the same document revision and scroll rule.
 *
 * May import: document state/history, the render layer, source-mode edits, plain-text rules, caret
 * commands and edit verification. Upholds: every command funnels its change through `applyEdit`, so
 * change → render → caret placement is identical everywhere.
 */

import {
  editStaysInsideShownSource,
  moveShownSource,
  withHeldShownSource
} from '../source_mode';
import { isInPlaceTextEdit, isPlainEdit } from '../syntax/plain_edit';
import { plainRun, writeRun } from './typed_text';
import { editorSelection, proseRoot, rangeOffsets } from './selection';
import type { EditKind, EditMark } from '../document/history';
import type { EditCaret, MarkdownEditorState } from '../document/state';
import { editsId } from './id_lock';
import type { VirtualBlockRenderer } from '../virtual_block_renderer';
import { scheduleEditVerification } from './edit_verification';
import { keepScroll, restoreCaret, showSourceAt } from './caret_placement';
import type { MarkdownHost } from '../host';

export { quoteContextAt } from './quote_context';
export {
  caretOffset,
  keepScroll,
  placeCaret,
  restoreCaret,
  restoreMark,
  restoreSelection,
  showSourceAt
} from './caret_placement';

/** What every editing command needs to read and change the document. */
export interface EditorContext {
  /** Application capabilities supplied at the editor composition root. */
  readonly host: MarkdownHost;
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
   * The editor's own seam holds it (`composition/input.ts`), so a command that wants the
   * keyboard asks for *this* rather than focusing the prose root: the seam would take the
   * focus from the root a moment later anyway, and that second change is what drops a
   * selection the command has just made (`clipboard.ts: selectAll`).
   */
  readonly focusText: () => void;
}

/**
 * Where the author is, as the mark an edit remembers: the range they selected, or the caret.
 *
 * It reads the same selection and mapping the commands edit, so what an edit remembers and what
 * it replaces cannot disagree. Example: a selection from offsets 4–9 is remembered as that range;
 * a collapsed caret at 6 is remembered as `{ from: 6, to: 6 }`.
 */
function authorMark(context: EditorContext): EditMark | null {
  const range = editorSelection(context, true);
  return range ? rangeOffsets(context, range) : null;
}

/**
 * Applies one raw-text edit, re-syncs the rendered window and moves the caret.
 *
 * Example: replacing `alpha` at `[0, 5)` with `beta` returns one revision whose caret defaults
 * to offset 4; a frontmatter `id:` write is refused and changes nothing.
 *
 * `allowFastPath` is false when an edit must rebuild its block, such as turning a blank-line
 * placeholder into a paragraph whose text node cannot carry the new block's caret.
 */
export function applyEdit(
  context: EditorContext,
  from: number,
  to: number,
  replacement: string,
  caret: EditCaret = from + replacement.length,
  kind: EditKind = 'other',
  allowFastPath = true
): boolean {
  if (editsId(context.state.getText(), from, to)) {
    context.host.notify({ kind: 'hint', code: 'document.idLocked' });
    return false;
  }
  const anchor = context.contentView.scrollTop;
  const before = authorMark(context) ?? { from, to: from };
  const editBlock = context.state.getBlockAtOffset(from);
  const literal =
    editBlock?.kind === 'fencedCode' ||
    editBlock?.kind === 'displayMath' ||
    editBlock?.kind === 'equation';
  const beforeText = context.state.getText();
  const rule = isPlainEdit(beforeText, from, to, replacement, literal);
  const root = proseRoot(context);
  const candidate = root
    ? plainRun(context.state, root, from, to, context.host.citations.renderedLength)
    : null;
  const sourceEditStays =
    candidate === null ||
    !candidate.source ||
    editStaysInsideShownSource(
      { from, to, replacement },
      {
        start: candidate.sourceGrowsAtStart,
        end: candidate.sourceGrowsAtEnd
      }
    );
  const direct =
    allowFastPath &&
    candidate !== null &&
    sourceEditStays &&
    (candidate.source
      ? isInPlaceTextEdit(beforeText, from, to, replacement)
      : rule ||
        ((kind === 'typing' || kind === 'commit') &&
          replacement !== '' &&
          isInPlaceTextEdit(beforeText, from, to, replacement)));
  const run = direct ? candidate : null;
  const written = run ? context.state.getBlockAtOffset(from) : null;
  if (written) {
    scheduleEditVerification(context, written, run?.source === true);
  }

  const target = context.state.replaceRange(from, to, replacement, { before, caret, kind });
  if (run) {
    writeRun(run, replacement);
    moveShownSource({ from, to, replacement });
    const block = context.state.getBlockAtOffset(from + replacement.length);
    if (block) {
      context.renderer.measureEditedBlock(block.lineStart);
    }
    withHeldShownSource(() => restoreCaret(context, target));
    keepScroll(context, anchor);
    context.onChanged?.(kind);
    return true;
  }

  showSourceAt(context, target);
  context.renderer.renderChanged();
  restoreCaret(context, target);
  keepScroll(context, anchor);
  context.onChanged?.(kind);
  return true;
}
