/**
 * Dragging a tree entry into a folder, with the pointer's own events.
 *
 * **Why not the browser's drag and drop.** The rows were `draggable` and this webview
 * agreed — WebKit reported `-webkit-user-drag: element` for a row — and a real pointer
 * drag still moved nothing: on macOS the webview's drag machinery takes the press over and
 * never delivers a `drop` to the row. The pointer's own events are the ones every other
 * interaction in this app is already built on, and the ones a probe can send, so the drag
 * is built from them: a press on a row that moves past a few pixels becomes a drag, the row
 * under the pointer is the target, and letting go moves the entry.
 *
 * What the rules refuse (`rules.ts: dropDecision`) shows no target and takes no drop,
 * so the pointer never promises a move the app would then refuse; the click that would
 * otherwise follow a drag is swallowed, so dragging a row never opens the file.
 *
 * May import: the drop rules (`./rules`). Upholds: a drag is a request to move an
 * entry, and the tree only accepts the moves it can really make.
 */

import { dropDecision, type TreeEntry } from './rules';

/** How far the pointer moves before a press is a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** Classes a row wears while it is the drop target, and nothing about its box. */
const TARGET_CLASSES = ['bg-base-300', 'outline', 'outline-1', 'outline-primary/60'];
/** Classes the row being dragged wears. */
const SOURCE_CLASSES = ['opacity-60'];
/** The attribute that addresses a row; the tree writes it and this reads it. */
const ROW_SELECTOR = '[data-tree-path]';

/** Every row this module was told about: what it stands for, and what a drop into it does. */
const rows = new WeakMap<
  HTMLElement,
  {
    entry: TreeEntry;
    onDrop: ((dragged: TreeEntry, targetDir: string) => void) | null;
    draggable: boolean;
  }
>();

/** The press that may become a drag. */
let pressed: { row: HTMLElement; entry: TreeEntry; x: number; y: number } | null = null;
/** The drag in progress. */
let dragging: { row: HTMLElement; entry: TreeEntry } | null = null;
/** The row the pointer is over now. */
let target: HTMLElement | null = null;
/** Set for the click that follows a drag, so it is swallowed rather than acted on. */
let swallowClick = false;

/** Makes a row a drag source. The workspace's own row is not one. */
export function makeDragSource(row: HTMLElement, entry: TreeEntry, isRoot: boolean): void {
  // No native drag may start from a row, three ways over: the webview takes the press
  // over when one does — which is what left the pointer path dead before — and a native
  // drop can *navigate* the webview to the path it carries, which looks like the page
  // reloading. `draggable` stays false, a `dragstart` is refused outright, and
  // `styles.css` keeps WebKit's own drag off every row.
  row.draggable = false;
  row.addEventListener('dragstart', (event) => event.preventDefault(), true);
  if (isRoot) {
    return;
  }
  const registered = rows.get(row) ?? { entry, onDrop: null, draggable: true };
  rows.set(row, { ...registered, entry, draggable: true });
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
  rows.set(row, { entry, onDrop, draggable: rows.get(row)?.draggable ?? false });
}

/** The row a point is over, with what it stands for. */
function rowAt(x: number, y: number): { row: HTMLElement; entry: TreeEntry } | null {
  const element = document.elementFromPoint(x, y);
  const row = element?.closest<HTMLElement>(ROW_SELECTOR) ?? null;
  const registered = row ? rows.get(row) : null;
  return row && registered ? { row, entry: registered.entry } : null;
}

/** Whether a row is being renamed: a press in an editable name belongs to the text. */
function editing(row: HTMLElement): boolean {
  const label = row.querySelector('span');
  return label?.isContentEditable === true;
}

/** Puts the target look on `row`, or takes it off everything when `row` is null. */
function markTarget(row: HTMLElement | null): void {
  if (target === row) {
    return;
  }
  target?.classList.remove(...TARGET_CLASSES);
  target = row;
  target?.classList.add(...TARGET_CLASSES);
}

/** Ends whatever the pointer was doing, and puts every row back as it was. */
function reset(): void {
  pressed = null;
  dragging?.row.classList.remove(...SOURCE_CLASSES);
  dragging = null;
  markTarget(null);
  document.body.classList.remove('select-none');
}

document.addEventListener('mousedown', (event) => {
  swallowClick = false;
  if (event.button !== 0) {
    return;
  }
  const over = rowAt(event.clientX, event.clientY);
  if (!over || !rows.get(over.row)?.draggable || editing(over.row)) {
    return;
  }
  pressed = { ...over, x: event.clientX, y: event.clientY };
});

document.addEventListener('mousemove', (event) => {
  if (pressed && !dragging) {
    const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    if (moved < DRAG_THRESHOLD) {
      return;
    }
    dragging = { row: pressed.row, entry: pressed.entry };
    dragging.row.classList.add(...SOURCE_CLASSES);
    // Nothing is being selected while a row is being dragged — including anything the
    // press itself had begun to select before the pointer moved far enough.
    document.body.classList.add('select-none');
    window.getSelection()?.removeAllRanges();
  }
  if (!dragging) {
    return;
  }
  const over = rowAt(event.clientX, event.clientY);
  const allowed = over !== null && dropDecision(dragging.entry, over.entry).allowed;
  markTarget(allowed && over ? over.row : null);
});

document.addEventListener('mouseup', () => {
  const drag = dragging;
  const drop = target ? rows.get(target) ?? null : null;
  const move = drag !== null && drop !== null && dropDecision(drag.entry, drop.entry).allowed;
  const dragged = drag?.entry ?? null;
  const onDrop = drop?.onDrop ?? null;
  const into = drop?.entry.path ?? '';
  if (drag) {
    // The click that follows a drag is the drag's, not the row's: a drag must not open
    // the file it grabbed.
    swallowClick = true;
  }
  reset();
  if (dragged && onDrop && move) {
    onDrop(dragged, into);
  }
});

document.addEventListener(
  'click',
  (event) => {
    if (!swallowClick) {
      return;
    }
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  },
  true
);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dragging) {
    swallowClick = true;
    reset();
  }
});

window.addEventListener('blur', () => reset());
