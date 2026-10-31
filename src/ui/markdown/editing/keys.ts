/**
 * What the keyboard means to the editor: the chords, the keys that write and move, and the keys
 * that belong to something else.
 *
 * Three things are not the editor's, in this order: a character the input method is handling (the
 * key that picks a candidate, or a letter it passes through, which still arrives as key code 229),
 * a Backspace that takes a letter off the word the method has marked, and any key while the
 * completion list is open — the list owns the arrows, Enter, Tab and Escape. What is left is the
 * text path: a shortcut, Tab in a table or a list or a code block, Enter as a newline or the next
 * cell, a deletion, a character, and otherwise an arrow.
 *
 * The editor hands in what it has (`KeyHost`); nothing here reaches into it. The rules that decide
 * what a key *does* are the commands' own (`editing/text_commands.ts` and friends).
 *
 * May import: the key's commands, the table and code helpers, the list and cell steps, the shape of
 * an editing context, and the completions the editor passes in. Upholds: one place that says which
 * key belongs to whom, so the input method, the list and the editor cannot each guess.
 */

import { applyCodeIndent } from './code';
import { continueTableDown, moveTableCell } from './table';
import { deleteText, insertNewline, insertText } from './text_commands';
import { runCommand } from '../../../commands/runtime';
import { handleChoiceCardKey } from '../choice_card';
import type { EditorContext } from './context';
import type { Completions } from './completions';
import type { CompositionInput } from './composition_input';

/** What the key path needs of the editor it serves. */
export interface KeyHost {
  readonly context: EditorContext;
  readonly composition: CompositionInput;
  readonly completions: Completions;
  /** Whether the document is a reference: navigation and copy stay, every writer goes. */
  readonly readOnly: () => boolean;
  /** The command/control chords, returning true when one was handled. */
  shortcut(event: KeyboardEvent): boolean;
  /** The arrow keys, after everything else has declined the key. */
  arrow(event: KeyboardEvent): void;
}

/** Keyboard shortcuts and plain text input, for one editor. */
export function handleEditorKey(event: KeyboardEvent, host: KeyHost): void {
  if (host.readOnly() && !readOnlyKey(event)) {
    event.preventDefault();
    return;
  }
  // A character the input method is handling is not the editor's. The keys *during* a
  // composition say so with `isComposing`; a key the method routes does so with
  // `keyCode` 229. Caps Lock alone is not that signal: in the English source it is
  // ordinary editor input, and delegating it to the seam leaves stale native context
  // across a source switch. Typing a 229 character both places writes it twice.
  // A 229 key that is *not* a character — `Enter` while a method is merely active, an
  // arrow, `Backspace`, `Tab` — is still the editor's, which is why the guard is about
  // the character and not about 229 alone (see
  // `docs/superpowers/specs/2026-10-03-input-method-typing-design.md`).
  if (event.isComposing || (event.keyCode === 229 && event.key.length === 1)) {
    return;
  }
  // A Backspace that edits the word being composed is the input method's: while the word is
  // marked, it takes a letter off *it*. The key that takes the last one arrives with the
  // composition already over and nothing on it to say so, and read as the editor's it
  // deletes the character before the caret in the *document* — measured by the reader: `你好`
  // with `zhongguo` being composed lost 好, and the same happens inside an English word,
  // which is the same event with a different word around it.
  if (event.key === 'Backspace' && host.composition.markedText()) {
    return;
  }
  // A language or Div-kind picker owns the same selection keys as the
  // completion list, from any caret context.
  if (handleChoiceCardKey(event)) {
    event.preventDefault();
    return;
  }
  // A list in hand owns the arrows, Enter and Escape; every other key is the text path's, and
  // what it wrote is what the list is drawn from again.
  if (host.completions.handleKey(event)) {
    event.preventDefault();
    return;
  }
  host.completions.restoreQueryCaret();
  handleTextKey(event, host);
  host.completions.refresh();
}

/**
 * The keys a read-only document still answers: moving through it, selecting and copying it, finding
 * in it, and leaving a control with Tab. Everything else is a writer — typing, deleting, undo, a
 * formatting chord — and is refused.
 */
function readOnlyKey(event: KeyboardEvent): boolean {
  const key = event.key;
  if (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'PageUp' ||
    key === 'PageDown' ||
    key === 'Escape' ||
    key === 'Tab'
  ) {
    return true;
  }
  return (event.metaKey || event.ctrlKey) && ['a', 'c', 'f'].includes(key.toLowerCase());
}

/** The text path: the chords, and the keys that write and move. */
function handleTextKey(event: KeyboardEvent, host: KeyHost): void {
  if (host.shortcut(event)) {
    return;
  }
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    // A reference document lets the browser keep Tab for moving focus; it has no cell or list to
    // step through, and the indentation below would be a write.
    if (host.readOnly()) {
      return;
    }
    // Tab walks a table's cells and moves a list item a level in or out;
    // elsewhere the browser keeps its own Tab, as it did before.
    if (moveTableCell(host.context, event.shiftKey ? -1 : 1)) {
    event.preventDefault();
    return;
  }
    // The list step goes through the registry like any other trigger: the
    // command is available where there is a list line to move, so a Tab that
    // cannot indent here falls through to the code block below.
    if (runCommand(event.shiftKey ? 'list:outdent' : 'list:indent', null, 'keyboard')) {
    event.preventDefault();
    return;
  }
    // Inside a fenced code block a Tab is two spaces, and Shift+Tab takes
    // them back.
    if (applyCodeIndent(host.context, event.shiftKey)) {
    event.preventDefault();
  }
    return;
  }
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    // Enter in a table cell goes down its column; where there is no cell
    // below, it leaves the table with an empty paragraph after it. A cell
    // holds text, not lines, so a soft break has no meaning there either.
    if (continueTableDown(host.context)) {
    event.preventDefault();
    return;
  }
    if (insertNewline(host.context)) {
    event.preventDefault();
  }
    return;
  }
  if (
    (event.key === 'Backspace' || event.key === 'Delete') &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    if (deleteText(host.context, event.key === 'Delete')) {
    event.preventDefault();
  }
    return;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (insertText(host.context, event.key)) {
    event.preventDefault();
  }
    return;
  }
  host.arrow(event);
  }
