/**
 * The inline rename: a row's name, made editable where it sits.
 *
 * The edit happens in the row's own label, so nothing about the tree moves while it is
 * open: the row keeps its height, the label keeps its box (a long name is clipped and the
 * browser scrolls the text to keep the caret in view rather than widening the sidebar),
 * and every other row stays where it was. The probe asserts exactly that —
 * `test/probes/tree-rename.js` measures the tree's scroll width and each row's rect before
 * and during the edit.
 *
 * The edit opens with the name selected and the markdown extension left out of the
 * selection (`tree_rules.ts: nameSelection`), so the author types the new name without
 * deleting the old one character by character and without touching the `.md`. Enter or
 * clicking away commits; Escape puts the old name back.
 *
 * May import: the selection rule (`./tree_rules`). Upholds: what the tree shows is what
 * the disk holds — an edit is one whole name, committed or dropped, never a half-written
 * state left on the row.
 */

import { nameSelection } from './tree_rules';

export interface RenameTarget {
  /** The label inside the row that becomes editable. */
  label: HTMLElement;
  /** The name it has now, extension and all. */
  basename: string;
  /** Whether it is a file (its extension is left out of the selection). */
  isFile: boolean;
  /**
   * Called with the name the author typed, when they commit. Its answer is not read: what
   * the row shows next comes from the reload the operations do, never from the edit.
   */
  commit(name: string): void | Promise<unknown>;
}

/**
 * Classes that change how the label looks while it is editable, and nothing about its box.
 * No rounding: the editable name is a field the author is typing in, and its corners stay
 * square the way the text's do.
 */
const EDITING_CLASSES = ['bg-base-100', 'outline', 'outline-1', 'outline-primary/50'];

/** Makes `label` editable and selects its name. Returns false when it was already editing. */
export function beginRename(target: RenameTarget): boolean {
  const { label } = target;
  if (label.isContentEditable) {
    return false;
  }
  label.textContent = target.basename;
  label.setAttribute('contenteditable', 'true');
  label.setAttribute('spellcheck', 'false');
  label.classList.add(...EDITING_CLASSES);
  // A click inside the editable name is the author placing the caret, not the row's own
  // click: without this the file would open (or the folder fold) under the edit.
  label.addEventListener('click', stop);
  label.addEventListener('mousedown', stop);
  label.focus({ preventScroll: true });
  selectName(label, target.basename, target.isFile);

  const finish = (commit: boolean) => {
    if (!label.isContentEditable) {
      return;
    }
    const typed = (label.textContent ?? '').trim();
    label.removeAttribute('contenteditable');
    label.removeAttribute('spellcheck');
    label.classList.remove(...EDITING_CLASSES);
    label.removeEventListener('click', stop);
    label.removeEventListener('mousedown', stop);
    label.removeEventListener('keydown', onKeyDown);
    label.removeEventListener('blur', onBlur);
    window.getSelection()?.removeAllRanges();
    // The name is put back before the work starts: the tree reloads when it is done, and
    // until then the row must not show a name the disk does not have.
    label.textContent = target.basename;
    if (commit && typed !== '' && typed !== target.basename) {
      void target.commit(typed);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  };
  // Clicking anywhere else commits, the way leaving a field does.
  const onBlur = () => finish(true);
  label.addEventListener('keydown', onKeyDown);
  label.addEventListener('blur', onBlur);
  return true;
}

/** Selects the name part of `basename` inside the now-editable label. */
function selectName(label: HTMLElement, basename: string, isFile: boolean): void {
  const node = label.firstChild;
  const selection = window.getSelection();
  if (!node || !selection) {
    return;
  }
  const { start, end } = nameSelection(basename, isFile);
  const range = document.createRange();
  range.setStart(node, Math.min(start, node.textContent?.length ?? 0));
  range.setEnd(node, Math.min(end, node.textContent?.length ?? 0));
  selection.removeAllRanges();
  selection.addRange(range);
}

function stop(event: Event): void {
  event.stopPropagation();
}
