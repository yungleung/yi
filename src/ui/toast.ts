import { BaseComponent } from './component';
import { eventManager } from '../services/event_manager';
import { TOAST_EVENT } from '../services/workspace';

/**
 * Displays closable informational notifications stacked at the bottom-right
 * corner of the window.
 */
export class Toast extends BaseComponent {
  constructor() {
    super('div', ['toast', 'toast-end', 'toast-bottom', 'z-50', 'pointer-events-none']);
    // Surface messages without being registered globally.
    void eventManager.on(TOAST_EVENT, (event: any) => {
      const message = event?.payload ?? event;
      this.info(String(message));
    });
  }

  info(message: string): void {
    const alert = document.createElement('div');
    alert.className = 'alert alert-info sm:alert-horizontal shadow-lg pointer-events-auto';
    alert.setAttribute('role', 'alert');

    const content = document.createElement('span');
    content.className = 'min-w-0';
    content.textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-sm btn-ghost btn-circle shrink-0';
    close.setAttribute('aria-label', 'Close notification');
    close.textContent = '✕';
    close.addEventListener('click', () => alert.remove());

    alert.append(content, close);
    this.element.appendChild(alert);
  }
}
