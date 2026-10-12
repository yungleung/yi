/**
 * The editor panel: the shell around the markdown editor — its state in the session, the toolbar
 * row, the find bar, and the news it emits when the document it holds changes.
 *
 * May import: the component base, the editor itself, the session, the wikilink resolver, the
 * messages and the events. Upholds: one panel per window, and the document it shows is the
 * session's — the panel captures and restores the view around the editor rather than keeping a
 * text of its own.
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
import { documentManager } from '../services/document_manager';
import { MESSAGE_EVENT } from '../services/messages';
import { t } from '../services/i18n';
import { DOCUMENT_OPENED } from './workspace/tree';
import { setWikilinkOpenHandler } from './markdown/wikilink_open';
import * as imageSources from './image/image_urls';

export const MARKDOWN_CONTENT_CHANGED = 'markdown_content_changed';

export class MarkdownEditor extends BaseComponent {
  private readonly innerEditor: WysiwygMarkdownEditor;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);
    this.innerEditor = new WysiwygMarkdownEditor();
    this.element.appendChild(this.innerEditor.element);

    // A wikilink clicked with ⌘ (Ctrl) asks for the document it names. The editor knows the target
    // (`markdown/wikilink_open.ts` is the port it asks through) and this is the shell that can
    // answer: the resolver turns a target into a path, and the session takes it from there — the
    // same way a click on the tree's own row arrives.
    setWikilinkOpenHandler((target) => void this.openWikilink(target));

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
   * Opens the document a wikilink target names, the way a click on the tree's own row opens one.
   *
   * A target is resolved by the workspace's own index — the file's name or its frontmatter id
   * (`services/document_manager.ts`) — and a target nothing answers to is *said so*: a reader who
   * asked to follow a link is looking at a link that goes nowhere, and the message names it. A file
   * that resolves but cannot be read says that instead, with the reason the read gave.
   */
  private async openWikilink(target: string): Promise<void> {
    const path = await documentManager.resolve(target);
    if (path === null) {
      void eventManager.emit(MESSAGE_EVENT, { text: t('wikilink.notFound', { target }) });
      return;
    }
    try {
      await documentSession.openPath(path);
    } catch (error) {
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('wikilink.openFailed', {
          target,
          message: error instanceof Error ? error.message : String(error)
        })
      });
    }
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
