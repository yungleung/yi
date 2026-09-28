/**
 * What the status bar says about the document on screen: whether the file holds what is on
 * screen, and whether the document is in the stack.
 *
 * Both are one fact of the session (`services/document_session.ts`), so both are read from it
 * on every change rather than kept: the session is the only record of which document is current,
 * whether its text differs from its file, and what the stack holds.
 *
 * May import: the session and the app's events. Upholds: a status component writes what the
 * session says and nothing else — no component keeps its own idea of whether a document is
 * saved or stacked.
 */

import { DOCUMENT_SESSION_CHANGED, documentSession } from '../services/session';
import { eventManager } from '../services/event_manager';
import { BaseComponent } from './component';

/** `Saved` while the file holds what is on screen, `Editing` while it does not. */
export class SavedStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;

  constructor() {
    super('span', ['text-xs', 'opacity-70', 'whitespace-nowrap']);
    this.element.dataset.documentSaved = 'true';
    this.label = this.element;
    this.update();
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => this.update());
  }

  private update(): void {
    const document = documentSession.current();
    const saved = document === null || document.content === document.saved;
    this.label.textContent = saved ? 'Saved' : 'Editing';
    this.element.dataset.saved = String(saved);
  }
}

/** Whether the document on screen is in the stack, and how many documents the stack holds. */
export class StackStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;

  constructor() {
    super('span', ['text-xs', 'opacity-70', 'whitespace-nowrap']);
    this.element.dataset.documentStacked = 'true';
    this.label = this.element;
    this.update();
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => this.update());
  }

  private update(): void {
    const document = documentSession.current();
    const stacked = document?.stacked === true;
    const size = documentSession.stack().length;
    this.label.textContent = stacked ? `In the stack · ${size}` : 'Not stacked';
    this.element.dataset.stacked = String(stacked);
  }
}
