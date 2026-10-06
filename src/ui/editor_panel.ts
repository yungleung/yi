/**
 * The editor panel: the shell around the markdown editor — its state in the session, the toolbar
 * row, the find bar, and the news it emits when the document it holds changes.
 *
 * May import: the component base, the editor itself, the session and the events. Upholds: one panel
 * per window, and the document it shows is the session's — the panel captures and restores the view
 * around the editor rather than keeping a text of its own.
 */

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
import type { DocumentView, SeenView } from '../services/session_rules';
import { documentSession } from '../services/session';
import { DOCUMENT_OPENED } from './workspace/tree';
import * as imageSources from './image/image_urls';

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

  /**
   * Which folder the document on screen lives in — what a relative image destination is read
   * from before the image folder the settings name (`image/image_urls.ts`).
   */
  setDocumentFolder(folder: string | null): void {
    imageSources.setDocumentFolder(folder);
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

  /**
   * Puts the keyboard back in the text — the way back from a mode laid over the editor (the
   * versions sheet). The caret is the session's and does not move for it.
   */
  focusText(): void {
    this.innerEditor.focusText();
  }

  /** Where the reader is in the document on screen, for the session to keep. */
  captureView(): SeenView {
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
