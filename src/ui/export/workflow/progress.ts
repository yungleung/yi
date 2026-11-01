/**
 * The status-bar message for an export that is still running.
 *
 * May import: the component base and the catalogue. Upholds: every start has an idempotent finish,
 * and the reader-visible state is busy exactly while at least one export owns the indicator.
 */

import { t } from '../../../services/i18n';
import { BaseComponent } from '../../component';

/** The port an export uses to keep the reader informed without knowing where the status is drawn. */
export interface ExportProgress {
  begin(): () => void;
}

export class ExportProgressStatus extends BaseComponent implements ExportProgress {
  private readonly label: HTMLSpanElement;
  private readonly active = new Set<symbol>();

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
  }

  /** Starts one export and answers with a finish that changes nothing when called twice. */
  begin(): () => void {
    const owner = Symbol('export');
    this.active.add(owner);
    this.render();
    return () => {
      if (this.active.delete(owner)) {
        this.render();
      }
    };
  }

  private render(): void {
    const busy = this.active.size > 0;
    this.element.classList.toggle('hidden', !busy);
    this.element.classList.toggle('flex', busy);
    this.element.setAttribute('aria-busy', String(busy));
    this.label.textContent = busy ? t('export.inProgress') : '';
  }
}
