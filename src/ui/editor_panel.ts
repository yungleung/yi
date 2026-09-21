/**
 * The editor panel: the shell around the markdown editor.
 *
 * This file was called `markdown_editor.ts`, one directory above
 * `markdown/markdown_editor.ts` and its `WysiwygMarkdownEditor`: two names for
 * one editor, and every import of either had to be read twice to know which
 * one it reached. The class is the panel the shell mounts — it opens the
 * documents the workspace tree asks for, and announces the content so the
 * status bar can count its words — so the file is named for that. The editor
 * itself keeps its name.
 */

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
