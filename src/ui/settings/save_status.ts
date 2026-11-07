/**
 * The one inline saving/saved/error sentence shared by settings pages.
 *
 * Example: an autosave sets "Saving…", then "Saved" for two seconds; a rejected
 * config write replaces it with the failure sentence rather than a stale "Saved".
 *
 * May import: locale text. Upholds: every settings page reports persistence the
 * same way and no callback can clear a newer status after its own timer.
 */

import { t } from '../../services/i18n';

export class SaveStatus {
  constructor(private readonly element: HTMLElement) {}

  saving(): void {
    this.element.textContent = t('settings.saving');
  }

  failedToLoad(): void {
    this.element.textContent = t('settings.failedToLoad');
  }

  message(text: string): void {
    this.element.textContent = text;
  }

  saved(): void {
    this.element.textContent = t('settings.saved');
    window.setTimeout(() => {
      if (this.element.textContent === t('settings.saved')) {
        this.element.textContent = '';
      }
    }, 2000);
  }

  failed(subject: string, error: unknown): void {
    console.error(`Failed to save ${subject}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    this.element.textContent = t('settings.failedToSave', { message });
  }
}
