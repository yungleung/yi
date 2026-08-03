import { getWordsCount } from '../api/stats';
import { BaseComponent } from './component';

export class WordsCountStatus extends BaseComponent {
  private readonly label: HTMLSpanElement;
  private requestVersion = 0;

  constructor() {
    super('span', ['text-xs', 'opacity-70', 'whitespace-nowrap']);
    this.label = this.element;
    this.label.textContent = 'Words: 0';
  }

  async update(markdown: string): Promise<void> {
    const requestVersion = ++this.requestVersion;

    try {
      const { words } = await getWordsCount(markdown);
      console.log(`Words count updated: ${words} (request version: ${requestVersion})`);
      if (requestVersion === this.requestVersion) {
        this.label.textContent = `Words: ${words}`;
      }
    } catch (error) {
      console.error('Failed to update word count:', error);
    }
  }
}
