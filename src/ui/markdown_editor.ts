import { BaseComponent } from './component';
import { WysiwygMarkdownEditor } from './markdown/markdown_editor';

export const MARKDOWN_CONTENT_CHANGED = 'markdown_content_changed';

export class MarkdownEditor extends BaseComponent {
  private readonly innerEditor: WysiwygMarkdownEditor;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);
    this.innerEditor = new WysiwygMarkdownEditor();
    this.element.appendChild(this.innerEditor.element);
  }

  setContent(content: string): void {
    this.innerEditor.setContent(content);
    void window.UI.eventManager.emit(MARKDOWN_CONTENT_CHANGED, this.getContent());
  }

  getContent(): string {
    return this.innerEditor.getContent();
  }
}
