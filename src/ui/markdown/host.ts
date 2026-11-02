/**
 * The application capabilities a Markdown editor consumes.
 *
 * Example: the shell supplies bibliography formatting, workspace link lookup,
 * clipboard reads and notice delivery; Markdown supplies editing semantics and
 * never imports the services that implement those capabilities.
 *
 * May import: nothing. Upholds: each host capability has a narrow, typed contract,
 * and the editor composition root is the only place an adapter is chosen.
 */

import type { EditorDocumentChanged } from '../../contracts';

/** One citation key and the title the completion list shows beside it. */
export interface CitationEntry {
  readonly key: string;
  readonly title: string;
}

/** The citation and bibliography reads an editor needs. */
export interface CitationService {
  /** Every citation key the loaded bibliography offers. */
  entries(): readonly CitationEntry[];
  /** Formats one citation source in the configured CSL style. */
  format(source: string): string;
  /** Returns the formatted text only when it is already cached. */
  formatCached(source: string): string | null;
  /** The bibliography entries a citation's works are listed under. */
  references(source: string): readonly string[];
  /** Renders one citation source's current text length for offset projection. */
  renderedLength(source: string): number;
  /** Calls `listener` whenever the bibliography changes; returns an unsubscribe function. */
  onChanged(listener: () => void): () => void;
}

/** One document target offered to a wikilink. */
export interface DocumentTarget {
  readonly target: string;
  readonly title: string;
}

/** Workspace document lookup used by wikilinks and their completion list. */
export interface DocumentLinkService {
  /** Every document target currently available in the workspace. */
  candidates(): Promise<readonly DocumentTarget[]>;
  /** Resolves a wikilink target to a file path, or null when nothing matches. */
  resolve(target: string): Promise<string | null>;
  /** The display title currently associated with a wikilink target. */
  title(target: string): Promise<string | null>;
}

/** Text and image reads from the platform clipboard. */
export interface ClipboardReader {
  readText(): Promise<string | null>;
}

/** Turns an image destination from the note into URLs the page may load. */
export interface ImageSourceService {
  sources(destination: string): readonly string[];
}

/** Facts and subscriptions through which the editor talks to the application shell. */
export interface EditorEventPort {
  documentChanged(payload: EditorDocumentChanged): void;
  layoutChanged(layout: 'page' | 'auto'): void;
  onInputSourceChanged(listener: () => void): void;
}

/** The command triggers Markdown asks the shell to resolve and dispatch. */
export interface EditorCommandPort {
  /**
   * Runs the app command bound to a keyboard chord.
   *
   * Example: Cmd/Ctrl+B returns true after `format:bold` is dispatched and false
   * when the chord does not name a command.
   */
  runShortcut(event: KeyboardEvent): boolean;
  /**
   * Runs a list indentation command so Tab shares the toolbar's command path.
   *
   * Example: Tab on a list item asks for `indent`; when the command is unavailable,
   * the editor falls through to the code block's own Tab behavior.
   */
  runListStep(direction: 'indent' | 'outdent'): boolean;
}

/** A notice the editor emits as a fact; only the shell decides how to word it. */
export type EditorNotice =
  | { readonly kind: 'hint'; readonly code: 'document.idLocked' }
  | {
      readonly kind: 'message';
      readonly code: 'reference.notFound';
      readonly params: { readonly id: string };
    };

/** Everything the editor needs from the application around it. */
export interface MarkdownHost {
  readonly citations: CitationService;
  readonly documents: DocumentLinkService;
  readonly images: ImageSourceService;
  readonly clipboard: ClipboardReader;
  readonly events: EditorEventPort;
  readonly commands: EditorCommandPort;
  /** Announces a fact that needs shell-owned presentation. */
  notify(notice: EditorNotice): void;
}
