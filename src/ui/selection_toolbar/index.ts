/**
 * The editing bar shown beside selected document text.
 *
 * Example: selecting a sentence shows formatting, insertion, list, footnote
 * and table controls without including workspace or session actions.
 *
 * May import: floating placement, the toolbar families and the shared table
 * picker. Upholds: selection UI is shell presentation; every button still
 * dispatches the same command as its title-bar and native-menu counterpart.
 */

import { BesideCard, type Box } from '../floating';
import {
  FootnoteToolbar,
  FormattingToolbar,
  ImageToolbar,
  LinkToolbar,
  ListToolbar,
  TableToolbar
} from '../toolbar/index';
import { TablePicker } from '../table';
import { documentSelectionBox } from './anchor';

export { documentCaretBox, documentSelectionBox, editorActionAnchor } from './anchor';

export class SelectionToolbar extends BesideCard {
  private anchor: Box | null = null;

  constructor(tablePicker: TablePicker) {
    super({
      anchor: () => this.anchor,
      className:
        'selection-toolbar flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-0.5 p-1'
    });
    this.element.dataset.selectionToolbar = 'true';
    this.element.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
      }
      event.stopPropagation();
    });
    const groups = [
      new FormattingToolbar(),
      new LinkToolbar(),
      new ImageToolbar(),
      new ListToolbar(),
      new FootnoteToolbar(),
      new TableToolbar(tablePicker)
    ];
    for (const [index, group] of groups.entries()) {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'mx-0.5 h-5 w-px bg-base-300';
        separator.setAttribute('aria-hidden', 'true');
        this.element.appendChild(separator);
      }
      this.element.appendChild(group.element);
    }
  }

  showAt(anchor: Box): void {
    this.anchor = anchor;
    this.open();
  }
}

/**
 * Keeps the selection bar in step with the browser selection.
 *
 * Returns the cleanup function owned by the calling window.
 */
export function installSelectionToolbar(
  toolbar: SelectionToolbar,
  root: HTMLElement
): () => void {
  const scroller =
    root.matches('.markdown-scroller')
      ? root
      : root.querySelector<HTMLElement>('.markdown-scroller');
  if (!scroller) {
    return () => undefined;
  }
  let frame: number | null = null;
  const sync = () => {
    frame = null;
    if (scroller.dataset.readOnly === 'true') {
      toolbar.close();
      return;
    }
    const anchor = documentSelectionBox(scroller);
    if (anchor) {
      toolbar.showAt(anchor);
    } else {
      toolbar.close();
    }
  };
  const schedule = () => {
    if (frame === null) {
      frame = requestAnimationFrame(sync);
    }
  };

  document.addEventListener('selectionchange', schedule);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  return () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
    document.removeEventListener('selectionchange', schedule);
    document.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
  };
}
