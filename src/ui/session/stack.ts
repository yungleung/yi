/**
 * The stack, as a list to choose from.
 *
 * It takes the shape of the table picker: a panel that hangs under the button that opened it,
 * closes on Escape, on a mousedown outside and after a pick, and never takes the caret with it.
 * Each row is one stacked document — its title on the left, a small × at the rightmost edge so
 * the rows stay justified — and the row of the document on screen is marked.
 *
 * The rows name commands (`commands.ts`) rather than reaching for the session
 * themselves, which is how a probe drives a row the way a reader does, and the panel registers
 * `session:openStack` itself: the module that owns the behaviour is the one that answers the
 * command its button names.
 *
 * May import: the session, the app's events and the registry. Upholds: the list is a view of
 * the session — it is built from `documentSession.stack()` on every open, and rebuilt when the
 * session changes while it is showing.
 */

import { eventManager } from '../../services/events';
import { DOCUMENT_SESSION_CHANGED, documentSession } from '../../services/session';
import { t } from '../../services/i18n';
import { AnchoredPanel } from '../floating';
import { registerCommand, runCommand } from '../../commands/runtime';

export class StackPopover extends AnchoredPanel {
  private readonly list: HTMLDivElement;

  constructor() {
    // `right-0`, inside the `relative` toolbar that hosts it.
    super({ className: 'w-64 p-1 right-0' });
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col';
    this.list.dataset.stackList = 'true';
    this.element.appendChild(this.list);

    registerCommand({
      id: 'session:openStack',
      run: () => {
        this.toggle();
        return null;
      }
    });
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  /** Shows the stack as it stands — the kind unhides and places it. */
  open(): void {
    this.render();
    super.open();
  }

  /** One row per stacked document: the title, and the × that drops it. */
  private render(): void {
    this.list.replaceChildren();
    const stacked = documentSession.stack();
    if (stacked.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'px-2 py-1 text-xs opacity-70';
      empty.dataset.stackEmpty = 'true';
      empty.textContent = t('session.stack.empty');
      this.list.appendChild(empty);
      return;
    }
    const current = documentSession.get().current;
    for (const document of stacked) {
      this.list.appendChild(this.makeRow(document.id, document.title, document.id === current));
    }
  }

  /** A row: the title is a button that restores, the × drops. */
  private makeRow(id: string, title: string, isCurrent: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'flex items-center rounded px-1';
    row.dataset.stackRow = id;
    if (isCurrent) {
      row.dataset.stackCurrent = 'true';
    }

    const open = document.createElement('button');
    open.type = 'button';
    open.className = [
      'btn',
      'btn-ghost',
      'btn-xs',
      'flex-1',
      'justify-start',
      'min-w-0',
      'font-normal',
      'normal-case',
      isCurrent ? 'font-semibold text-primary' : ''
    ]
      .filter((name) => name.length > 0)
      .join(' ');
    open.dataset.stackOpen = id;
    open.title = title;
    const label = document.createElement('span');
    label.className = 'truncate';
    label.textContent = title;
    open.appendChild(label);
    open.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    open.addEventListener('click', () => {
      this.close();
      runCommand('session:restore', id, 'toolbar');
    });

    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'btn btn-ghost btn-xs px-1 shrink-0';
    drop.dataset.stackDrop = id;
    drop.title = t('session.stack.drop', { title });
    drop.setAttribute('aria-label', drop.title);
    drop.textContent = '×';
    drop.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    drop.addEventListener('click', () => {
      runCommand('session:drop', id, 'toolbar');
    });

    row.append(open, drop);
    return row;
  }
}
