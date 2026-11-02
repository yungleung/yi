/**
 * The command operations Markdown exposes to the app's command registry.
 *
 * Example: the shell maps `format:bold` to `applyFormatting('strong')`, and maps
 * `document:replaceRange` to `replaceRange(6, 11, 'Bob')` after checking the revision.
 *
 * May import: Markdown editing rules and the neutral editor contracts. Upholds:
 * external triggers reach one typed operation without importing the editor context,
 * document state or DOM, and Markdown does not import the global command registry.
 */

import type {
  EditorDocumentPosition,
  EditorReplaceRange
} from '../../contracts';
import { cutSelection, selectAll } from './editing/clipboard';
import { applyEdit, type EditorContext } from './editing/context';
import { applyFormatting } from './editing/formatting';
import { insertFootnote } from './editing/footnotes';
import { insertLink } from './editing/links';
import {
  applyListCommand,
  listCommandEdit,
  type ListCommand
} from './editing/lists';
import {
  insertTable,
  runTableCommand,
  type TableCommand,
  type TableTarget
} from './editing/table';
import { insertThematicBreak } from './editing/thematic_break';
import type { FormattingStyle } from './format';

/** The shell's only editing surface for command registration and invocation. */
export interface MarkdownCommandApi {
  /** The current document identity and revision. */
  documentPosition(): EditorDocumentPosition;
  /** The raw document length, used to validate an external edit range. */
  documentLength(): number;
  /**
   * Applies a raw range replacement.
   *
   * Example: replacing `[6, 11)` with `"Bob"` returns true; a frontmatter id edit
   * returns false and leaves the document unchanged.
   */
  replaceRange(input: Omit<EditorReplaceRange, keyof EditorDocumentPosition>): boolean;
  undo(): void;
  redo(): void;
  cut(): void;
  selectAll(): void;
  insertFootnote(): void;
  insertLink(): void;
  insertRule(): void;
  applyFormatting(style: FormattingStyle): void;
  /** Whether a list command has an edit at the current selection. */
  listCommandAvailable(command: ListCommand): boolean;
  applyListCommand(command: ListCommand): void;
  applyTableCommand(command: TableCommand, target: TableTarget): void;
  insertTable(size: { readonly rows: number; readonly columns: number }): void;
  togglePageLayout(): void;
  openFind(replace: boolean): void;
  closeFind(): void;
}

/** Editor-owned callbacks whose UI state stays inside Markdown. */
export interface MarkdownCommandHost {
  readonly context: EditorContext;
  undo(): void;
  redo(): void;
  togglePageLayout(): void;
  openFind(replace: boolean): void;
  closeFind(): void;
}

/**
 * Builds the narrow command surface from the editor's live context.
 *
 * Example: `undo()` replays the editor-owned history step and emits the same
 * `document_changed` fact as the keyboard chord because both reach this callback.
 */
export function createMarkdownCommandApi(
  host: MarkdownCommandHost
): MarkdownCommandApi {
  const { context } = host;
  return {
    documentPosition: () => ({
      documentKey: context.state.getDocumentKey(),
      revision: context.state.getRevision()
    }),
    documentLength: () => context.state.getText().length,
    replaceRange: ({ from, to, replacement }) =>
      applyEdit(context, from, to, replacement),
    undo: () => host.undo(),
    redo: () => host.redo(),
    cut: () => {
      cutSelection(context);
    },
    selectAll: () => {
      selectAll(context);
    },
    insertFootnote: () => {
      insertFootnote(context);
    },
    insertLink: () => {
      void insertLink(context);
    },
    insertRule: () => {
      insertThematicBreak(context);
    },
    applyFormatting: (style) => {
      applyFormatting(context, style);
    },
    listCommandAvailable: (command) => listCommandEdit(context, command) !== null,
    applyListCommand: (command) => {
      applyListCommand(context, command);
    },
    applyTableCommand: (command, target) => {
      runTableCommand(context, target, command);
    },
    insertTable: (size) => {
      insertTable(context, size);
    },
    togglePageLayout: () => host.togglePageLayout(),
    openFind: (replace) => host.openFind(replace),
    closeFind: () => host.closeFind()
  };
}
