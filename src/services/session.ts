/**
 * The living session: the documents the reader has open, kept in step with the editor and with
 * the file they are written to.
 *
 * The rules live in `session_rules.ts` and are pure; this is the part that holds the editor
 * and the dialog and the disk. It is the only place that knows all three, so it is the only
 * place that decides what a click in the tree means:
 *
 * - the document on screen is **captured** — its text and its view — whenever it is about to be
 *   left, and (debounced) whenever it is typed in, which is what makes a stacked document always
 *   its own latest version;
 * - a file being opened while an *unstacked* document is on screen **asks** first, because saying
 *   no would lose it — unless the document on screen is one the file already holds, which has
 *   nothing to lose, or the reader has asked for it to be pushed instead of being asked
 *   (`push_unstacked_on_open`, `session_rules.ts: openDecision`);
 * - the session file is written soon after any change rather than on the way out, since the
 *   webview is not promised a moment on the way out.
 *
 * May import: the session's rules (`session_rules.ts`), the app's config, events and file
 * commands (`api/files`, the file plugin's read), and the dialog plugin. Upholds: one copy of a
 * document — the one in the session — so nothing here keeps a second text of its own.
 */

import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { writeTextAtomically } from '../api/files';
import { loadSessionText, saveSessionText } from '../api/session';
import type { Prompter, Question } from '../ui/prompt';
import { configManager } from './config_manager';
import { eventManager } from './event_manager';
import { t } from './i18n';
import { MESSAGE_EVENT } from './messages';
import { parentFolder } from './workspace_folders';
import { documentTitle } from './document_identity';
import {
  capture as captureInto,
  currentDocument,
  dropFromStack,
  emptySession,
  isSaved,
  keyFor,
  markSaved,
  openDocument,
  openDecision,
  openInto,
  parseSession,
  restore as restoreDocument,
  serializeSession,
  setPath,
  setStacked,
  stackedDocuments,
  type DocumentView,
  type IncomingDocument,
  type SeenView,
  type SessionDocument,
  type SessionState
} from './session_rules';

/** Emitted whenever the documents, the stack or the current document change. */
export const DOCUMENT_SESSION_CHANGED = 'document_session_changed';

/** How long after the last edit the session is written. */
const SAVE_DELAY_MS = 800;

/**
 * What the session needs from the editor: its text, which document it is showing, and where the
 * reader is in it.
 */
export interface SessionEditor {
  getContent(): string;
  setContent(content: string): void;
  /**
   * The folder of the document about to be shown. A relative image destination is read from it
   * (`ui/image/image_urls.ts`), and it has to arrive *before* the content does, or the
   * first paint would resolve against the note the reader was in before this one.
   */
  setDocumentFolder(folder: string | null): void;
  /** Where the reader is, with null for what the editor cannot currently see (a dropped block). */
  captureView(): SeenView;
  restoreView(view: DocumentView): void;
}

class DocumentSession {
  private state: SessionState = emptySession();
  private editor: SessionEditor | null = null;
  private prompter: Prompter | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private madeKeys = 0;
  /**
   * What a document with no id of its own is keyed by. It carries this run's stamp as well as a
   * count, because the count starts again every time the app does: without the stamp, a new
   * pathless document would be given the key of one the session file restored — a *different*
   * document, whose text would then be kept and the new one never opened.
   */
  private readonly run = Date.now().toString(36);

  /** Gives the session the editor whose documents it holds. */
  attach(editor: SessionEditor): void {
    this.editor = editor;
  }

  /** Gives the session the app's prompt. Without one it never asks — it keeps. */
  attachPrompter(prompter: Prompter): void {
    this.prompter = prompter;
  }

  /** The documents, for the buttons and the status bar to read. */
  get(): SessionState {
    return this.state;
  }

  current(): SessionDocument | null {
    return currentDocument(this.state);
  }

  stack(): SessionDocument[] {
    return stackedDocuments(this.state);
  }

  /** Reads the session left by the last run and puts its current document back on screen. */
  async load(): Promise<void> {
    try {
      this.state = parseSession(await loadSessionText());
    } catch (error) {
      console.error('Failed to read the session:', error);
      this.state = emptySession();
    }
    const current = this.current();
    if (current) {
      this.show(current);
    }
    this.announce();
  }

  /**
   * A file was clicked in the tree. What that means depends on what is on screen
   * (`session_rules.ts: openDecision`), and only the unstacked case has to ask.
   */
  async openFile(incoming: IncomingDocument): Promise<void> {
    const id = keyFor(incoming.path, incoming.content, () => `${this.run}-${++this.madeKeys}`);
    const action = openDecision(
      this.state,
      { id },
      configManager.get()?.push_unstacked_on_open ?? false
    );
    if (action === 'alreadyOpen') {
      return;
    }
    if (action === 'bringForward') {
      this.restore(id);
      return;
    }
    // Whether the document on screen is kept — pushed into the stack — or let go. Only this
    // question decides it: a stacked one is kept whatever happens, and the actions that do not
    // ask are the ones with nothing to lose.
    let keep = false;
    if (action === 'ask') {
      const title = this.current()?.title ?? 'This document';
      keep = await this.ask({
        title: t('session.askOpen.title'),
        message: t('session.askOpen.message', { title }),
        yes: t('session.askOpen.yes'),
        no: t('session.askOpen.no')
      });
    } else if (action === 'pushAndOpen') {
      keep = true;
    }
    // The document being left is captured before it goes: a pushed one keeps its latest text
    // and its view, whichever answer the reader gave.
    this.capture();
    this.state = openInto(this.state, incoming, id, keep);
    const opened = this.current();
    if (opened) {
      this.show(opened);
    }
    this.announce();
    await this.persist();
  }

  /**
   * A file's own text read and opened: what a click on a row of the tree and a ⌘-click on a
   * wikilink both mean, and the one place the two agree about how a path becomes the document on
   * screen. Nothing is said about a file that cannot be read — a caller that can name it in its
   * own message catches this (`ui/workspace/tree.ts` says which file, `ui/editor_panel.ts` says
   * which wikilink target), because only it knows what to call the thing that failed.
   */
  async openPath(path: string): Promise<void> {
    const content = await readTextFile(path);
    await this.openFile({ path, content });
  }

  /**
   * A version's text, adopted: the file is written with it and the document on screen becomes it.
   *
   * The reader has already been asked — the sheet puts one question in front of this, with a cancel
   * that does nothing at all — so there is no second question here, and no keeping of what was on
   * screen: they said yes to replacing it. It is a file write and a document swap, never a git
   * write.
   */
  async openVersion(path: string, content: string): Promise<void> {
    const onScreen = this.current();
    try {
      await writeTextAtomically(path, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('session.saveFailed', { title: onScreen?.title ?? path, message })
      });
      return;
    }
    const id = keyFor(path, content, () => `${this.run}-${++this.madeKeys}`);
    // A document with a file is keyed by its path (`document_identity.ts: documentId`), so a restore
    // is not "open another document": it is *this* document holding other text now.
    const documents = [...this.state.documents];
    const held = documents.some((document) => document.id === id);
    this.state = held
      ? {
          ...this.state,
          current: id,
          documents: documents.map((document) =>
            document.id === id
              ? {
                  ...document,
                  content,
                  saved: content,
                  title: documentTitle(content, document.path),
                  view: { caret: 0, to: null, scroll: null }
                }
              : document
          )
        }
      : {
          ...this.state,
          current: id,
          documents: [...documents, openDocument({ path, content }, id)]
        };
    const opened = this.current();
    if (opened) {
      this.show(opened);
    }
    this.announce();
    await this.persist();
  }

  /** Pushes the document on screen into the stack, or takes it out again. */
  toggleStack(): void {
    const document = this.current();
    if (!document) {
      return;
    }
    this.capture();
    this.state = setStacked(this.state, document.id, !document.stacked);
    this.announce();
    void this.persist();
  }

  /** Brings a document from the stack to the screen, where it left off. */
  restore(id: string): void {
    if (id === this.state.current) {
      return;
    }
    this.capture();
    this.state = restoreDocument(this.state, id);
    const document = this.current();
    if (document && this.editor) {
      this.show(document);
    }
    this.announce();
    void this.persist();
  }

  /**
   * Drops a document from the stack. A document that is not on screen and has text the file
   * does not have is asked about first: dropping it would be the only copy gone.
   */
  async drop(id: string): Promise<void> {
    const document = this.state.documents.find((candidate) => candidate.id === id);
    if (!document) {
      return;
    }
    if (document.id !== this.state.current && !isSaved(document)) {
      const saveIt = await this.ask({
        title: t('session.askDrop.title'),
        message: t('session.askDrop.message', { title: document.title }),
        yes: t('session.askDrop.yes'),
        no: t('session.askDrop.no')
      });
      if (saveIt && !(await this.writeDocument(document))) {
        return;
      }
    }
    this.state = dropFromStack(this.state, id);
    this.announce();
    await this.persist();
  }

  /** Writes the document on screen to its file, asking for one when it has none. */
  async save(): Promise<void> {
    const document = this.current();
    if (!document || !this.editor) {
      return;
    }
    if (document.path) {
      await this.writeCurrent();
      return;
    }
    await this.saveAs();
  }

  /**
   * Writes the document on screen to its file, capturing what the editor holds first.
   *
   * The capture is the point: this copy can be up to `SAVE_DELAY_MS` behind a keystroke, so
   * anything that needs the file to hold what the reader *sees* — a version, above all — asks
   * here rather than writing the copy. Answers false when there is no document or no file to write
   * to; a write that failed has already said so.
   */
  async writeCurrent(): Promise<boolean> {
    const document = this.current();
    if (!document || !this.editor || !document.path) {
      return false;
    }
    this.capture();
    return await this.writeDocument(this.current() ?? document);
  }

  /** Writes the document on screen to a file of its own, and follows it from then on. */
  async saveAs(): Promise<void> {
    const document = this.current();
    if (!document || !this.editor) {
      return;
    }
    this.capture();
    const latest = this.current() ?? document;
    const path = await saveDialog({
      defaultPath: `${latest.title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (!path) {
      return;
    }
    this.state = setPath(this.state, latest.id, path);
    await this.writeDocument({ ...latest, path });
  }

  /**
   * The reader has moved: they typed, or scrolled. Both mean the document's copy — its text and
   * where they are in it — is out of date, and both are worth writing soon afterwards rather
   * than waiting for them to leave the document, because the app is not promised a moment on
   * the way out.
   */
  noteMoved(): void {
    this.capture();
    this.announce();
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persist();
    }, SAVE_DELAY_MS);
  }

  /** Writes one document's text to its file, and remembers that it is what the file holds. */
  private async writeDocument(document: SessionDocument): Promise<boolean> {
    if (!document.path) {
      return false;
    }
    try {
      await writeTextAtomically(document.path, document.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('session.saveFailed', { title: document.title, message })
      });
      return false;
    }
    this.state = markSaved(this.state, document.id, document.content);
    this.announce();
    await this.persist();
    return true;
  }

  /** What the editor holds now, written into the document it is showing. */
  private capture(): void {
    if (!this.editor) {
      return;
    }
    this.state = captureInto(this.state, this.editor.getContent(), this.editor.captureView());
  }

  /** Puts a document on screen, where it left off. */
  private show(document: SessionDocument): void {
    if (!this.editor) {
      return;
    }
    // Which folder the document lives in, before its text: a relative image destination is read
    // from there, and a paint that arrived first would be resolved against the document before it.
    this.editor.setDocumentFolder(
      document.path === null ? null : parentFolder(document.path)
    );
    this.editor.setContent(document.content);
    this.editor.restoreView(document.view);
  }

  private async persist(): Promise<void> {
    try {
      await saveSessionText(serializeSession(this.state));
    } catch (error) {
      console.error('Failed to write the session:', error);
    }
  }

  private announce(): void {
    void eventManager.emit(DOCUMENT_SESSION_CHANGED, this.state);
  }

  /** The reader's answer, or — with no card to ask on — the answer that keeps the document. */
  private async ask(question: Question): Promise<boolean> {
    if (!this.prompter) {
      return true;
    }
    return await this.prompter.ask(question);
  }
}

/** The app-wide session. */
export const documentSession = new DocumentSession();
