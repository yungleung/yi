/**
 * The status-bar message for an export that is still running.
 *
 * May import: export activity, the typed events, the component base and the catalogue. Upholds:
 * the reader-visible state is busy exactly while the activity owner reports a running export.
 */

import {
  EXPORT_ACTIVITY_CHANGED,
  exportActivity
} from '../../services/export_activity';
import { eventManager } from '../../services/events';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';

export class ExportProgressStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;

  constructor() {
    super('span', [
      'hidden',
      'items-center',
      'gap-1',
      'whitespace-nowrap',
      'text-xs',
      'font-medium',
      'text-primary'
    ]);
    this.element.setAttribute('data-export-progress', 'true');
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-busy', 'false');

    const spinner = document.createElement('span');
    spinner.className = 'loading loading-spinner loading-xs';
    spinner.setAttribute('aria-hidden', 'true');
    this.label = document.createElement('span');
    this.element.append(spinner, this.label);
    this.render(exportActivity.current().active);
    void eventManager.on(EXPORT_ACTIVITY_CHANGED, (event) => {
      this.render(event.payload.active);
    });
  }

  private render(active: number): void {
    const busy = active > 0;
    this.element.classList.toggle('hidden', !busy);
    this.element.classList.toggle('flex', busy);
    this.element.setAttribute('aria-busy', String(busy));
    this.label.textContent = busy ? t('export.inProgress') : '';
  }
}
