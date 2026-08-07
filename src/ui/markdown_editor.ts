import { BaseComponent } from './component';
import { eventManager } from '../services/event_manager';
import { WysiwygMarkdownEditor } from './markdown/markdown_editor';
import { DOCUMENT_OPENED } from './workspace_tree';

export const MARKDOWN_CONTENT_CHANGED = 'markdown_content_changed';

export class MarkdownEditor extends BaseComponent {
  private readonly innerEditor: WysiwygMarkdownEditor;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);
    this.innerEditor = new WysiwygMarkdownEditor();
    this.element.appendChild(this.innerEditor.element);

    // Open documents clicked in the workspace tree without a global reference.
    void eventManager.on(DOCUMENT_OPENED, (event: any) => {
      const content = event?.payload ?? event;
      this.setContent(String(content));
    });
  }

  setContent(content: string): void {
    this.innerEditor.setContent(content);
    void eventManager.emit(MARKDOWN_CONTENT_CHANGED, this.getContent());
  }

  getContent(): string {
    return this.innerEditor.getContent();
  }

  refresh(): void {
    this.innerEditor.refresh();
  }
}
