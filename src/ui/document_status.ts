/**
 * What the status bar says about the document on screen: whether the file holds what is on
 * screen, and whether the document is in the stack.
 *
 * Both are one fact of the session (`services/session_rules.ts`), so both are read from it
 * on every change rather than kept: the session is the only record of which document is current,
 * whether its text differs from its file, and what the stack holds.
 *
 * May import: the session and the app's events. Upholds: a status component writes what the
 * session says and nothing else — no component keeps its own idea of whether a document is
 * saved or stacked.
 */

import { DOCUMENT_SESSION_CHANGED, documentSession } from '../services/session';
import { eventManager } from '../services/event_manager';
import { t } from '../services/i18n';
import { BaseComponent } from './component';

type StatusTone = 'success' | 'warning' | 'muted';

const STATUS_TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-base-content/60'
};

/** Sets the one state colour a status has, replacing the previous one rather than adding to it. */
function tone(element: HTMLElement, next: StatusTone): void {
  for (const className of Object.values(STATUS_TONE_CLASSES)) {
    element.classList.remove(className);
  }
  element.classList.add(STATUS_TONE_CLASSES[next]);
  element.dataset.tone = next;
}

/** `Saved` while the file holds what is on screen, `Editing` while it does not. */
export class SavedStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;

  constructor() {
    super('span', ['text-xs', 'whitespace-nowrap']);
    this.element.dataset.documentSaved = 'true';
    this.label = this.element;
    this.update();
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => this.update());
  }

  private update(): void {
    const document = documentSession.current();
    if (document?.readOnly) {
      this.label.textContent = t('status.readOnly');
      this.element.dataset.saved = 'true';
      this.element.dataset.readOnly = 'true';
      tone(this.element, 'muted');
      return;
    }
    const saved = document === null || document.content === document.saved;
    this.label.textContent = saved ? t('status.saved') : t('status.editing');
    this.element.dataset.saved = String(saved);
    this.element.dataset.readOnly = 'false';
    tone(this.element, saved ? 'success' : 'warning');
  }
}

/** Whether the document on screen is in the stack, and how many documents the stack holds. */
export class StackStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;

  constructor() {
    super('span', ['text-xs', 'whitespace-nowrap']);
    this.element.dataset.documentStacked = 'true';
    this.label = this.element;
    this.update();
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => this.update());
  }

  private update(): void {
    const document = documentSession.current();
    const stacked = document?.stacked === true;
    const size = documentSession.stack().length;
    this.label.textContent = stacked ? t('status.stacked', { size }) : t('status.notStacked');
    this.element.dataset.stacked = String(stacked);
    tone(this.element, stacked ? 'success' : 'muted');
  }
}
