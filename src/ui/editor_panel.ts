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
import { EDITOR_EDITED, type EditorLayout } from './markdown/markdown_editor';
import type { DocumentView } from '../services/document_session';
import { documentSession } from '../services/session';
import { DOCUMENT_OPENED } from './workspace/tree';

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

    // Every edit is news to the session, which keeps the document's own copy — and through it
    // the file the document is written to — in step. The event carries nothing: the session
    // reads the text when it captures, and it debounces both the copy and the write.
    void eventManager.on(EDITOR_EDITED, () => documentSession.noteMoved());

    // Scrolling is news too, and for a different reason: the reader who quits the app from the
    // middle of a note expects to come back to the middle of it. A scroll event does not bubble,
    // so this listens on the way *down* to the scroller inside the editor.
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    this.element.addEventListener(
      'scroll',
      () => {
        if (scrollTimer !== null) {
          clearTimeout(scrollTimer);
        }
        scrollTimer = setTimeout(() => {
          scrollTimer = null;
          documentSession.noteMoved();
        }, 400);
      },
      true
    );
  }

  setContent(content: string): void {
    this.innerEditor.setContent(content);
    void eventManager.emit(MARKDOWN_CONTENT_CHANGED, this.getContent());
  }

  /** Draws the editor as a page of A4 or as a column the width of the pane. */
  setLayout(layout: EditorLayout): void {
    this.innerEditor.setLayout(layout);
  }

  getLayout(): EditorLayout {
    return this.innerEditor.getLayout();
  }

  getContent(): string {
    return this.innerEditor.getContent();
  }

  /** Where the reader is in the document on screen, for the session to keep. */
  captureView(): DocumentView {
    return this.innerEditor.captureView();
  }

  /** Puts the reader back where the session last saw them. */
  restoreView(view: DocumentView): void {
    this.innerEditor.restoreView(view);
  }

  refresh(): void {
    this.innerEditor.refresh();
  }
}
