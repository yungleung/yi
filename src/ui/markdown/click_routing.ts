/**
 * The clicks the editor routes itself.
 *
 * A click inside the document is not always "put the caret here": a task
 * checkbox toggles, a footnote marker jumps to its definition, a right-click in
 * a table cell opens the table's menu on that cell, and a click that missed
 * every markdown node still places the caret. The editor wires these listeners
 * — and the order they run in — while the behaviour lives here.
 *
 * The module reads the editor context and calls the editing commands and the
 * table menu; it keeps no state of its own, so a click routes the same way
 * wherever the editor happens to be.
 *
 * May import: the editing commands it routes to (`editing/*`), the table menu
 * and the editor context. Upholds: a click is routed by what is under it —
 * the handlers read the document and the rendered tree, and hold no state that
 * could disagree with them.
 */

import { showTableMenu } from '../table/table_menu';
import { tableMenuModel } from '../table/table_menu_model';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { EditorContext } from './editing/context';
import { jumpToFootnote } from './editing/footnotes';
import { placeCaretFromPointer } from './editing/pointer';
import { isOpenableUrl } from './syntax/link_edits';
import { tableSnapshot, type TableTarget } from './editing/table';
import { toggleTask } from './editing/text_commands';

/** Toggles a task-list checkbox without moving the caret. */
export function routeTaskClick(context: EditorContext, event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
    return;
  }
  if (toggleTask(context, target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** Jumps between a footnote's marker and its definition. */
export function routeFootnoteClick(context: EditorContext, event: MouseEvent): void {
  const target = event.target as Element | null;
  // A marker and a definition's label are both text the author edits where it sits: a
  // plain click belongs to the editor — the marker opens its label as its source, the
  // label holds the caret — and what jumps is Ctrl-click or ⌘-click (see
  // `routeFootnoteMenu` for the form macOS delivers as a context menu).
  const reference = target?.closest<HTMLElement>('[data-footnote-ref]');
  const definition = target?.closest<HTMLElement>('[data-footnote-def]');
  const jumping = event.ctrlKey || event.metaKey;
  const element = jumping ? reference ?? definition : null;
  const label = element?.dataset.footnoteRef ?? element?.dataset.footnoteDef;
  // The click is swallowed only when the jump happens: a marker whose note the document
  // does not define would otherwise lose the editor's own click, and the caret with it.
  if (
    !element ||
    !label ||
    !jumpToFootnote(context, label, element.dataset.footnoteRef ? 'reference' : 'definition')
  ) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The macOS form of a Ctrl-click on a marker.
 *
 * There the system delivers Ctrl-left-click as a `contextmenu` event, so the `click`
 * this file waits for never arrives and the jump would be unreachable. The gesture is
 * the same, so the result is: a Ctrl-held context menu on a marker jumps.
 */
export function routeFootnoteMenu(context: EditorContext, event: MouseEvent): void {
  const target = event.target as Element | null;
  const marker = target?.closest<HTMLElement>('[data-footnote-ref]');
  const definition = target?.closest<HTMLElement>('[data-footnote-def]');
  const element = marker ?? definition;
  const label = element?.dataset.footnoteRef ?? element?.dataset.footnoteDef;
  if (!element || !label || !event.ctrlKey) {
    return;
  }
  event.preventDefault();
  jumpToFootnote(context, label, marker ? 'reference' : 'definition');
}

/** Places the caret for a click that no markdown node handled. */
export function routePointerClick(context: EditorContext, event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('.markdown-node')) {
    return;
  }
  placeCaretFromPointer(context, event.clientY);
}

/**
 * Opens a link in the system browser, for the click that asks for it.
 *
 * A plain click on a link belongs to the editor — it opens the link's source for
 * editing, like every other node whose rendering holds none of its characters — and
 * ⌘-click (Ctrl-click, the same gesture the footnote marker jumps with) is the one
 * that leaves the app. The webview must never navigate to the URL itself: the app
 * hands it to the system's opener, which is what the preview card's links do too, and
 * the same rule decides which hrefs may go (`syntax/link_edits.ts: isOpenableUrl`).
 *
 * A link the app cannot open — a relative path, a fragment, an empty href — keeps the
 * plain click, because opening the source is the only thing left that it can mean.
 */
export function routeLinkClick(event: MouseEvent): void {
  if (!event.metaKey && !event.ctrlKey) {
    return;
  }
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  // A footnote marker renders as an `<a href="#fn-1">` too, and its own gesture is the
  // jump (`routeFootnoteClick`), which runs on the same event.
  if (!anchor || anchor.closest('[data-footnote-ref], [data-footnote-def]')) {
    return;
  }
  const href = anchor.getAttribute('href') ?? '';
  if (!isOpenableUrl(href)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void openUrl(href).catch(() => undefined);
}

/**
 * A right-click inside a table cell opens the table's menu on that cell.
 *
 * The cell is captured *before* the menu opens: the native menu takes focus,
 * so the command that follows has to be told what it acts on.
 */
export function routeContextMenu(context: EditorContext, event: MouseEvent): void {
  const cell = (event.target as Element | null)?.closest<HTMLElement>('[data-table-cell]');
  if (!cell) {
    return;
  }
  // The webview has its own context menu; ours replaces it.
  event.preventDefault();
  const blockElement = cell.closest('.markdown-block') as HTMLElement | null;
  const lineStart = Number(blockElement?.dataset.lineStart);
  const [row, column] = (cell.dataset.tableCell ?? '').split(':').map(Number);
  if (!Number.isFinite(lineStart) || !Number.isFinite(row) || !Number.isFinite(column)) {
    return;
  }
  const target: TableTarget = { lineStart, row, column };
  const snapshot = tableSnapshot(context, target);
  if (!snapshot) {
    return;
  }
  void showTableMenu(tableMenuModel(snapshot.source, row, column), target, {
    x: event.clientX,
    y: event.clientY
  });
}
