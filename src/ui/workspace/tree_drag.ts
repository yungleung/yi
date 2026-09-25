/**
 * Dragging a tree entry into a folder.
 *
 * The drag follows the browser's own drag and drop: the row says it is draggable and
 * carries the entry's path as text, and every folder row accepts a drop that the rules
 * allow (`tree_rules.ts: dropDecision`) while showing the one it would land in. What the
 * rules refuse — a file, the entry itself, a folder inside itself, the folder it already
 * lives in — shows no target and takes no drop, so the pointer never promises a move the
 * app would then refuse.
 *
 * May import: the drop rules (`./tree_rules`). Upholds: a drag is a request to move an
 * entry, and the tree only accepts the moves it can really make.
 */

import { dropDecision, type TreeEntry } from './tree_rules';

/** The entry being dragged, as the page's rows see it (one drag at a time). */
let dragging: TreeEntry | null = null;
/** The row the pointer is over now, so the drag's end can clear it wherever it is. */
let target: HTMLElement | null = null;

/** Classes a row wears while it is the drop target, and nothing about its box. */
const TARGET_CLASSES = ['bg-base-300', 'outline', 'outline-1', 'outline-primary/60'];

/** Makes a row draggable, carrying its path. The workspace row itself is not draggable. */
export function makeDragSource(row: HTMLElement, entry: TreeEntry, isRoot: boolean): void {
  if (isRoot) {
    return;
  }
  row.draggable = true;
  row.addEventListener('dragstart', (event) => {
    const drag = event as DragEvent;
    dragging = entry;
    row.classList.add('opacity-60');
    drag.dataTransfer?.setData('text/plain', entry.path);
    if (drag.dataTransfer) {
      drag.dataTransfer.effectAllowed = 'move';
    }
  });
  row.addEventListener('dragend', () => {
    dragging = null;
    row.classList.remove('opacity-60');
    clearTargets();
  });
}

/**
 * Lets a row take a drop, when the rules allow it. `targetDir` is the folder the row
 * stands for; `onDrop` is handed the entry that was dragged.
 */
export function makeDropTarget(
  row: HTMLElement,
  entry: TreeEntry,
  onDrop: (dragged: TreeEntry, targetDir: string) => void
): void {
  row.addEventListener('dragover', (event) => {
    const drag = event as DragEvent;
    if (!dragging || !dropDecision(dragging, entry).allowed) {
      return;
    }
    // Saying yes to the event is what lets a drop happen at all; the classes are the
    // only other sign the pointer gets.
    drag.preventDefault();
    if (drag.dataTransfer) {
      drag.dataTransfer.dropEffect = 'move';
    }
    if (target !== row) {
      clearTarget();
      target = row;
    }
    row.classList.add(...TARGET_CLASSES);
  });
  row.addEventListener('dragleave', () => {
    if (target === row) {
      clearTarget();
    }
  });
  row.addEventListener('drop', (event) => {
    const drag = event as DragEvent;
    clearTarget();
    const dragged = dragging;
    dragging = null;
    if (!dragged || !dropDecision(dragged, entry).allowed) {
      return;
    }
    drag.preventDefault();
    drag.stopPropagation();
    onDrop(dragged, entry.path);
  });
}

/** The row a drop landed on stops glowing when the drag is over anywhere. */
function clearTargets(): void {
  clearTarget();
}

/** Takes the target look off the row that has it, if any. */
function clearTarget(): void {
  target?.classList.remove(...TARGET_CLASSES);
  target = null;
}
