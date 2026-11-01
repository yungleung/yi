/**
 * The editor panel: the shell around the markdown editor — its state in the session, the toolbar
 * row, the find bar, and the news it emits when the document it holds changes.
 *
 * May import: the component base, the editor itself, the session, the resolver and the path rules,
 * the config, the messages and the events. Upholds: one panel per window, and the document it shows
 * is the session's — the panel captures and restores the view around the editor rather than keeping
 * a text of its own.
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
import { eventManager } from '../services/events';
import { WysiwygMarkdownEditor } from './markdown/markdown_editor';
import type { EditorLayout } from './markdown/markdown_editor';
import type { DocumentView, SeenView } from '../services/session';
import { documentSession } from '../services/session';
import { documentManager } from '../services/documents';
import { MESSAGE_EVENT } from '../services/messages';
import { t } from '../services/i18n';
import { DOCUMENT_OPENED } from './workspace';
import { setOpenRequestHandler, type OpenRequest } from './markdown/link_opens';
import { configManager } from '../services/config_manager';
import { destinationPaths } from '../services/workspace';
import * as imageSources from './image/index';
import { DOCUMENT_CHANGED } from '../services/events';

export class MarkdownEditor extends BaseComponent {
  private readonly innerEditor: WysiwygMarkdownEditor;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);
    this.innerEditor = new WysiwygMarkdownEditor();
    this.element.appendChild(this.innerEditor.element);

    // A link clicked with ⌘ (Ctrl) asks for the document it names — a wikilink's target, or an
    // ordinary link's path. The editor knows which (`markdown/link_opens.ts` is the port it asks
    // through) and this is the shell that can answer: a target through the workspace's index, a
    // path through the note's own folder and the workspace, and the session takes it from there —
    // the same way a click on the tree's own row arrives.
    setOpenRequestHandler((request) => void this.openRequested(request));

    // Open documents clicked in the workspace tree without a global reference.
    void eventManager.on(DOCUMENT_OPENED, (event: any) => {
      const content = event?.payload ?? event;
      this.setContent(String(content));
    });

    // Every edit is news to the session, which keeps the document's own copy — and through it
    // the file the document is written to — in step. The event's committed text updates the
    // copy without reading layout; the caret/view capture waits for the debounced write.
    void eventManager.on(DOCUMENT_CHANGED, (event) => {
      if (event.payload.reason !== 'load') {
        documentSession.noteDocumentChanged(event.payload.text);
      }
    });

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
  }

  /**
   * Opens what a link asked for with ⌘ (Ctrl), the way a click on the tree's own row opens a file.
   *
   * Two kinds of link ask: a wikilink, by the *target* it names, and an ordinary link, by the
   * *path* it was written with — and each is resolved by its own rule.
   */
  private async openRequested(request: OpenRequest): Promise<void> {
    if (request.kind === 'wikilink') {
      await this.openWikilink(request.target);
      return;
    }
    await this.openLinkPath(request.destination);
  }

  /**
   * Opens the document a wikilink target names.
   *
   * A target is resolved by the workspace's own index — the file's name or its frontmatter id
   * (`services/documents/index.ts`) — and a target nothing answers to is *said so*: a reader who
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
   * Opens the note an ordinary link's path names.
   *
   * A link is written by hand as often as it is pasted, so its path is read the way an image's is
   * (`services/workspace/folders.ts`): the note's own folder first and then the root of the
   * workspace, each of them also read with the escapes a copied path may carry. The first
   * candidate that *reads* is the one that opens, and a destination none of them answers to is
   * *said so*, with the reason the last read gave — a reader who asked to follow a link is looking
   * at a link that goes nowhere.
   */
  private async openLinkPath(destination: string): Promise<void> {
    const workspace = configManager.get()?.workspace ?? null;
    const candidates = destinationPaths(destination, workspace, imageSources.imageBases().document);
    let failure: string | null = null;
    for (const path of candidates) {
      try {
        await documentSession.openPath(path);
        return;
      } catch (error) {
        // A candidate that is not there is not the answer: the next one is tried.
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    if (failure !== null) {
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('link.openFailed', { name: destination, message: failure })
      });
    }
  }

  /**
   * Which folder the document on screen lives in — what a relative image destination is read
   * from before the image folder the settings name (`image/index.ts`).
   */
  setDocumentFolder(folder: string | null): void {
    imageSources.setDocumentFolder(folder);
  }

  /** Draws the editor as a page of A4 or as a column the width of the pane. */
  setLayout(layout: EditorLayout): void {
    this.innerEditor.setLayout(layout);
  }

  /** Shows a reference document without accepting an edit. */
  setReadOnly(readOnly: boolean): void {
    this.innerEditor.setReadOnly(readOnly);
  }

  getLayout(): EditorLayout {
    return this.innerEditor.getLayout();
  }

  getContent(): string {
    return this.innerEditor.getContent();
  }

  /**
   * Puts the keyboard back in the text — the way back from a modal over the editor (the version
   * history). The caret is the session's and does not move for it.
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
