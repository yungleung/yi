import { getWordsCount } from '../api/stats';
import { eventManager } from '../services/event_manager';
import { t } from '../services/i18n';
import { BaseComponent } from './component';
import { MARKDOWN_CONTENT_CHANGED } from './editor_panel';

export class WordsCountStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;
  private requestVersion = 0;

  constructor() {
    super('span', ['text-xs', 'opacity-70', 'whitespace-nowrap']);
    this.label = this.element;
    this.label.textContent = t('status.words', { count: 0 });

    // Keep the word count in sync with the document without being registered
    // as a global component.
    void eventManager.on(MARKDOWN_CONTENT_CHANGED, (event: any) => {
      const markdown = event?.payload ?? event;
      void this.update(markdown);
    });
  }

  async update(markdown: string): Promise<void> {
    const requestVersion = ++this.requestVersion;

    try {
      const { words } = await getWordsCount(markdown);
      console.log(`Words count updated: ${words} (request version: ${requestVersion})`);
      if (requestVersion === this.requestVersion) {
        this.label.textContent = t('status.words', { count: words });
      }
    } catch (error) {
      console.error('Failed to update word count:', error);
    }
  }
}
