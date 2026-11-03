/**
 * What the status bar says about the document's size: words, characters, and the CJK count.
 *
 * May import: the component base, the stats seam and the events that say the text changed. Upholds:
 * one reading of the count for the window, asked of the backend rather than counted twice.
 */

import { getWordsCount } from '../../api/stats';
import { DOCUMENT_CHANGED, eventManager } from '../../services/events';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';

export class WordsCountStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;
  private requestVersion = 0;

  constructor() {
    super('span', ['text-xs', 'opacity-70', 'whitespace-nowrap']);
    this.label = this.element;
    this.element.dataset.statusWords = 'true';
    this.label.textContent = t('status.words', { count: 0 });

    // Keep the word count in sync with the document without being registered
    // as a global component.
    void eventManager.on(DOCUMENT_CHANGED, (event) => {
      if (event.payload.reason === 'load') {
        void this.update(event.payload.text);
      }
    });
  }

  private async update(markdown: string): Promise<void> {
    const requestVersion = ++this.requestVersion;

    try {
      const { words } = await getWordsCount(markdown);
      if (requestVersion === this.requestVersion) {
        this.label.textContent = t('status.words', { count: words });
      }
    } catch (error) {
      console.error('Failed to update word count:', error);
    }
  }
}
