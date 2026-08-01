import { BaseComponent } from './component';
import { WysiwygMarkdownEditor } from '../markdown/markdown_editor';

export class MarkdownEditor extends BaseComponent {
  private innerEditor: WysiwygMarkdownEditor;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);
    this.innerEditor = new WysiwygMarkdownEditor();
    this.element.appendChild(this.innerEditor.element);
  }

  setContent(content: string): void {
    this.innerEditor.setContent(content);
  }

  getContent(): string {
    return this.innerEditor.getContent();
  }
}
