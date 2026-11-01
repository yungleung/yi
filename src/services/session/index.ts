/**
 * The living session: the documents the reader has open, kept in step with the editor and with
 * the file they are written to.
 *
 * The rules live in `rules.ts` and are pure; this is the part that holds the editor
 * and the dialog and the disk. It is the only place that knows all three, so it is the only
 * place that decides what a click in the tree means:
 *
 * - the document on screen is **captured** — its text and its view — whenever it is about to be
 *   left, and (debounced) whenever it is typed in, which is what makes a stacked document always
 *   its own latest version;
 * - a file being opened while an *unstacked* document is on screen **asks** first, because saying
 *   no would lose it — unless the document on screen is one the file already holds, which has
 *   nothing to lose, or the reader has asked for it to be pushed instead of being asked
 *   (`push_unstacked_on_open`, `rules.ts: openDecision`);
 * - the session file is written soon after any change rather than on the way out, since the
 *   webview is not promised a moment on the way out.
 *
 * May import: the session's pure rules and focused editor, persistence and file adapters, plus the
 * app's config/events. Upholds: one copy of a document — the one in the session — so nothing here
 * keeps a second text of its own.
 */

import type { Prompter, Question } from '../../ui/prompt';
import { configManager } from '../config_manager';
import { eventManager } from '../event_manager';
import { t } from '../i18n';
import { MESSAGE_EVENT } from '../messages';
import { documentManager } from '../document_manager';
import {
  adoptVersion,
  currentDocument,
  dropFromStack,
  emptySession,
  isSaved,
  keyFor,
  markSaved,
  openDecision,
  openInto,
  recordContent,
  replaceReference,
  restore as restoreDocument,
  setPath,
  setStacked,
  stackNavigation,
  stackedDocuments,
  type IncomingDocument,
  type SessionDocument,
  type SessionState
} from './rules';
import {
  captureEditorDocument,
  showDocumentInEditor,
  type SessionEditor
} from './editor';
import {
  loadPersistedSession,
  persistSession
} from './persistence';
import {
  chooseDocumentPath,
  readDocumentFile,
  writeDocumentFile
} from './files';

export type {
  DocumentView,
  IncomingDocument,
  SeenView,
  SessionDocument,
  SessionState
} from './model';
export type { SessionEditor } from './editor';

/** Emitted whenever the documents, the stack or the current document change. */
export const DOCUMENT_SESSION_CHANGED = 'document_session_changed';

/** How long after the last edit the session is written. */
const SAVE_DELAY_MS = 800;

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
    this.state = await loadPersistedSession();
    const current = this.current();
    if (current) {
      this.show(current);
    } else {
      // No document is on screen, so no document is refusing an edit. Without this a session the
      // harness empties after a tutorial would leave the next document read-only.
      this.editor?.setReadOnly(false);
    }
    this.announce();
  }

  /**
   * A file was clicked in the tree. What that means depends on what is on screen
   * (`rules.ts: openDecision`), and only the unstacked case has to ask.
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
    // Capture before any question: clicking an answer is a click outside the editor, and the
    // editor's click rule clears its logical caret. The view belongs to the document being left,
    // so it has to be recorded while that document is still on screen.
    this.capture();
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
    this.state = openInto(this.state, incoming, id, keep);
    const opened = this.current();
    if (opened) {
      this.show(opened);
    }
    this.announce();
    await this.persist();
  }

  /**
   * Opens a bundled read-only reference, replacing a restored copy when the guide changed.
   *
   * A reference has a stable id, so `openFile` would otherwise answer `alreadyOpen` and leave the
   * old text from the session file on screen. The fresh bundled text is the authority.
   */
  async openReference(incoming: IncomingDocument): Promise<void> {
    const id = keyFor(incoming.path, incoming.content, () => `${this.run}-${++this.madeKeys}`);
    const existing = this.state.documents.find((document) => document.id === id);
    if (!existing || !existing.readOnly) {
      await this.openFile(incoming);
      return;
    }
    this.capture();
    this.state = replaceReference(this.state, incoming, id);
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
    const content = await readDocumentFile(path);
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
      await writeDocumentFile(path, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('session.saveFailed', { title: onScreen?.title ?? path, message })
      });
      return;
    }
    // The file now holds this text: the title and id indexes must read it, not their last answer.
    documentManager.invalidate();
    const id = keyFor(path, content, () => `${this.run}-${++this.madeKeys}`);
    // A document with a file is keyed by its path (`document_identity.ts: documentId`), so a restore
    // is not "open another document": it is *this* document holding other text now.
    this.state = adoptVersion(this.state, path, content, id);
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

  /** Moves to the next or previous stacked document, keeping the current one if it was not stacked. */
  navigateStack(direction: 1 | -1): void {
    const before = this.state.current;
    this.capture();
    const movement = stackNavigation(this.state, direction);
    this.state = movement.state;
    if (movement.id !== null && movement.id !== before) {
      this.state = restoreDocument(this.state, movement.id);
      const document = this.current();
      if (document) {
        this.show(document);
      }
    }
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
    if (!document || document.readOnly || !this.editor) {
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
    if (!document || document.readOnly || !this.editor || !document.path) {
      return false;
    }
    this.capture();
    return await this.writeDocument(this.current() ?? document);
  }

  /** Writes the document on screen to a file of its own, and follows it from then on. */
  async saveAs(): Promise<void> {
    const document = this.current();
    if (!document || document.readOnly || !this.editor) {
      return;
    }
    this.capture();
    const latest = this.current() ?? document;
    const path = await chooseDocumentPath(latest.title);
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
    this.schedulePersist(false);
  }

  /**
   * A committed document edit arrived: record its authoritative text now, then capture the view
   * and persist after the same debounce. Recording text is free; the view reads layout, so it
   * waits until typing has stopped rather than adding two rectangle reads to every keystroke.
   */
  noteDocumentChanged(content: string): void {
    this.state = recordContent(this.state, content);
    this.announce();
    this.schedulePersist(true);
  }

  private schedulePersist(captureView: boolean): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (captureView) {
        this.capture();
        this.announce();
      }
      void this.persist();
    }, SAVE_DELAY_MS);
  }

  /** Writes one document's text to its file, and remembers that it is what the file holds. */
  private async writeDocument(document: SessionDocument): Promise<boolean> {
    if (!document.path) {
      return false;
    }
    try {
      await writeDocumentFile(document.path, document.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('session.saveFailed', { title: document.title, message })
      });
      return false;
    }
    documentManager.invalidate();
    this.state = markSaved(this.state, document.id, document.content);
    this.announce();
    await this.persist();
    return true;
  }

  /** What the editor holds now, written into the document it is showing. */
  private capture(): void {
    this.state = captureEditorDocument(this.state, this.editor);
  }

  /** Puts a document on screen, where it left off. */
  private show(document: SessionDocument): void {
    showDocumentInEditor(this.editor, document);
  }

  private async persist(): Promise<void> {
    await persistSession(this.state);
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
