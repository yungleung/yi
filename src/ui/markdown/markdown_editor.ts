/**
 * The editor: the document, the rendered window, and the wiring between them.
 *
 * This is the module the shell mounts. It owns the state, the virtual block
 * renderer and the DOM events, and it registers the commands it owns under the
 * registry's names; every editing feature itself lives in its own module under
 * `editing/` (see the class comment below), and the clicks that are not plain
 * caret placement live in `click_routing.ts`.
 *
 * May import: everything above it — the render layer, the caret, the commands'
 * registry and the editing rules it registers. Upholds: a keystroke reaches
 * behaviour by name (`runCommand`) or by the text path (`editing/text_commands`),
 * never by a second copy of the rule.
 */

import { BaseComponent } from '../component';
import { eventManager } from '../../services/event_manager';
import { CITATION_UPDATED } from '../../services/bibliography';
import { registerEditorCommands } from './commands/editor_commands';
import {
  ensureCaretRendered,
  getCaretRange,
  onCaretRangeChanged,
  setSelectionRange
} from './caret/caret';
import { setSourceEntryHandler, sourceEntryOffset } from './source_mode';
import { ARROW_KEY_DIRECTIONS, moveCaret } from './caret/navigation';
import {
  caretOffset,
  keepScroll,
  proseRoot,
  restoreCaret,
  showSourceAt,
  type EditorContext
} from './editing/context';
import { documentOffsetAt } from './caret/offsets';
import { copySelection, pasteText } from './editing/clipboard';
import { deleteText, insertNewline, insertText } from './editing/text_commands';
import { FindBar } from './editing/find_bar';
import { FindController } from './editing/find_controller';
import { applyCodeIndent } from './editing/code';
import { continueTableDown, moveTableCell } from './editing/table';
import {
  routeContextMenu,
  routeFootnoteClick,
  routePointerClick,
  routeTaskClick
} from './click_routing';
// The document the editor starts on. It lives in the fixture workspace so the
// demo can be edited as markdown rather than as a string array in code.
import defaultDocument from '../../../test/fixtures/workspace/default-document.md?raw';
import { commandForKey } from './commands/keymap';
import { MENU_COMMANDS } from './commands/menu';
import { runCommand } from './commands/registry';
import { MarkdownEditorState } from './document/state';
import { VirtualBlockRenderer } from './virtual_block_renderer';


/**
 * The WYSIWYG markdown editor.
 *
 * The editor itself is deliberately thin: it owns the raw document state, the
 * virtualized block renderer and the DOM event wiring, while each editing
 * feature lives in its own module under `editing/`:
 *
 * - `editing/context.ts` — the shared context plus selection/caret mapping,
 * - `editing/clipboard.ts` — copy, cut, paste, select all,
 * - `editing/text_commands.ts` — typing, deleting, line breaks, task markers,
 * - `editing/formatting.ts` — bold/italic/strike/inline-code commands,
 * - `editing/find_bar.ts` / `editing/find_controller.ts` — find and replace.
 *
 * Undo/redo lives in the state (`MarkdownEditorState#undo/redo`); the editor
 * only restores the caret around it.
 */
export class WysiwygMarkdownEditor extends BaseComponent {
  /** Owns the raw document and maintains its blocks. */
  private readonly state = new MarkdownEditorState(defaultDocument);
  private readonly contentView: HTMLElement;
  private readonly renderer: VirtualBlockRenderer;
  private readonly context: EditorContext;
  private readonly findBar: FindBar;
  private readonly find: FindController;
  /** A caret offset whose block is not mounted (restored on a later sync). */
  private pendingCaretOffset: number | null = null;

  constructor() {
    super('div', ['relative', 'flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);

    this.contentView = document.createElement('div');
    this.contentView.className = 'markdown-scroller flex-1 min-h-0 overflow-auto p-4';
    this.appendChild(this.contentView);
    this.renderer = new VirtualBlockRenderer(this.contentView, this.state);
    this.context = {
      state: this.state,
      renderer: this.renderer,
      contentView: this.contentView
    };
    // Revealable nodes ask the editor where the caret is in the raw document;
    // they cannot work it out themselves (see `revealable_node.ts`).
    // Source mode follows the caret: the block the caret is in shows its own
    // text (see `source_mode.ts`). A click on a block's rendering asks the
    // editor to enter it, because only the editor knows the block's text.
    onCaretRangeChanged(() => this.followCaret());
    setSourceEntryHandler((blockElement, offset) => this.enterSource(blockElement, offset));

    // The window is rebuilt as the user scrolls; re-anchor the caret only
    // when the block it lived in was dropped, so scrolling never moves it.
    this.renderer.setSyncHooks({
      capture: () => this.pendingCaretOffset ?? caretOffset(this.context),
      restore: (snapshot) => this.reanchorCaret(snapshot)
    });

    this.findBar = new FindBar({
      onQueryChanged: () => this.find.updateMatches(true),
      onNext: (reverse) => this.find.next(reverse),
      onReplace: () => this.find.replaceCurrent(),
      onReplaceAll: () => this.find.replaceAll(),
      onClose: () => this.find.close()
    });
    this.find = new FindController(this.context, this.findBar);
    this.element.appendChild(this.findBar.element);

    this.contentView.addEventListener('keydown', (event) => this.handleKeydown(event));
    // The four routed clicks, in the order they have to run: a checkbox and a
    // footnote marker are handled before a node can place a caret where the
    // click landed, and a click that missed every node still places one.
    this.contentView.addEventListener('click', (event) => routeTaskClick(this.context, event), true);
    this.contentView.addEventListener(
      'click',
      (event) => routeFootnoteClick(this.context, event),
      true
    );
    this.contentView.addEventListener('click', (event) => routePointerClick(this.context, event));
    this.contentView.addEventListener('contextmenu', (event) =>
      routeContextMenu(this.context, event)
    );
    this.contentView.addEventListener('copy', (event) => copySelection(this.context, event));
    this.contentView.addEventListener('paste', (event) => pasteText(this.context, event));

    // Keep the editor's selection state in sync with the native DOM selection
    // (the rendered text is selectable by dragging).
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectionRange(null);
        return;
      }
      const range = selection.getRangeAt(0);
      setSelectionRange(
        !range.collapsed && this.contentView.contains(range.commonAncestorContainer) ? range : null
      );
    });

    this.registerCommandEvents();
    this.renderer.render();
    // The bibliography manager announces when its data is ready or refreshed;
    // citations render from it, so the mounted blocks are rebuilt.
    void eventManager.on(CITATION_UPDATED, () => this.refresh());
  }

  /** Loads a document and renders its first window. */
  setContent(content: string): void {
    // A new document is a new set of blocks and nodes: whatever was showing
    // its own source is gone, and a range that named it must not fall on
    // whatever of the new document happens to start and end at the same
    // offsets.
    showSourceAt(this.context, null);
    this.state.loadText(content);
    this.renderer.render();
  }

  /** The raw markdown source. */
  getContent(): string {
    return this.state.getText();
  }

  /** Re-renders the mounted blocks (bibliography or settings changed). */
  refresh(): void {
    this.renderer.refresh();
  }

  /** Wires the application-level commands (menu, toolbar, keyboard). */
  private registerCommandEvents(): void {
    // The commands this editor owns are registered in one place, and it is not
    // here: what is left is the wiring they need back from the editor.
    registerEditorCommands({
      context: this.context,
      openFind: (replace) => this.find.open(replace),
      closeFind: () => this.find.close(),
      applyHistory: (direction) => this.applyHistory(direction)
    });
    // The native menu names these commands by string; the bridge is the one place
    // that knows which string means which command.
    for (const event of Object.keys(MENU_COMMANDS)) {
      void eventManager.on(event, () => runCommand(MENU_COMMANDS[event]));
    }
  }

  /** Keyboard shortcuts and plain text input. */
  private handleKeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    if (this.handleShortcut(event)) {
      return;
    }
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Tab walks a table's cells and moves a list item a level in or out;
      // elsewhere the browser keeps its own Tab, as it did before.
      if (moveTableCell(this.context, event.shiftKey ? -1 : 1)) {
        event.preventDefault();
        return;
      }
      // The list step goes through the registry like any other trigger: the
      // command is available where there is a list line to move, so a Tab that
      // cannot indent here falls through to the code block below.
      if (runCommand(event.shiftKey ? 'list:outdent' : 'list:indent')) {
        event.preventDefault();
        return;
      }
      // Inside a fenced code block a Tab is two spaces, and Shift+Tab takes
      // them back.
      if (applyCodeIndent(this.context, event.shiftKey)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Enter in a table cell goes down its column; where there is no cell
      // below, it leaves the table with an empty paragraph after it. A cell
      // holds text, not lines, so a soft break has no meaning there either.
      if (continueTableDown(this.context)) {
        event.preventDefault();
        return;
      }
      if (insertNewline(this.context)) {
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
      if (deleteText(this.context, event.key === 'Delete')) {
        event.preventDefault();
      }
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (insertText(this.context, event.key)) {
        event.preventDefault();
      }
      return;
    }
    this.handleArrowKey(event);
  }

  /** Command/control shortcuts, returning true when one was handled. */
  private handleShortcut(event: KeyboardEvent): boolean {
    const command = commandForKey(event);
    if (!command) {
      return false;
    }
    event.preventDefault();
    runCommand(command);
    return true;
  }

  /** Arrow keys steer the caret (the renderer's own caret, not a native one). */
  private handleArrowKey(event: KeyboardEvent): void {
    const direction = ARROW_KEY_DIRECTIONS[event.key];
    if (!direction || !getCaretRange()) {
      return;
    }
    event.preventDefault();
    if (!event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
    const root = proseRoot(this.context);
    if (root) {
      moveCaret(root, direction);
    }
  }

  /**
   * Keeps the block that shows its own text in step with the caret: the block
   * holding the caret shows it, and none does when the caret is gone (see
   * `source_mode.ts`). A caret the editor cannot map yet — the block holding
   * it is being rebuilt — says nothing about where the author is, so it leaves
   * the mode as it stands; the next caret position decides.
   */
  private followCaret(): void {
    const range = getCaretRange();
    if (!range) {
      showSourceAt(this.context, null);
      return;
    }
    const location = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    if (location) {
      showSourceAt(this.context, location.offset);
    }
  }

  /**
   * A click on a block's rendering enters the block's own text, with the caret
   * at the end of its last content line. The rendering cannot name the
   * character that was clicked, so this is the entry point that is always
   * true; the next click lands on the text, where the mapping is exact.
   */
  private enterSource(blockElement: HTMLElement, offset: number | null): void {
    const block = this.state.getBlockAtLine(Number(blockElement.dataset.lineStart));
    if (!block) {
      return;
    }
    const within = offset ?? sourceEntryOffset(block.text);
    restoreCaret(this.context, block.charStart + within);
  }

  /**
   * Keeps the caret alive across virtualized window changes: if its block
   * survived the swap only the caret span has to be re-created, and if the
   * block was dropped the offset is restored once it is mounted again.
   */
  private reanchorCaret(snapshot: unknown): void {
    const caret = getCaretRange();
    if (caret && caret.startContainer.isConnected) {
      this.pendingCaretOffset = null;
      ensureCaretRendered();
      return;
    }
    const offset = this.pendingCaretOffset ?? (typeof snapshot === 'number' ? snapshot : null);
    if (offset === null) {
      return;
    }
    this.pendingCaretOffset = restoreCaret(this.context, offset) ? null : offset;
  }

  /** Undo/redo keeps the caret at the same document offset when it can. */
  private applyHistory(direction: 'undo' | 'redo'): void {
    const offset = caretOffset(this.context) ?? this.state.getText().length;
    const anchor = this.contentView.scrollTop;
    const applied = direction === 'undo' ? this.state.undo() : this.state.redo();
    if (!applied) {
      return;
    }
    // Undo and redo move the caret to a document offset like an edit does, so
    // the block that shows its own text is the block that offset lands in —
    // decided before the rebuild, so the block is built in the right shape.
    showSourceAt(this.context, Math.min(offset, this.state.getText().length));
    this.renderer.renderChanged();
    restoreCaret(this.context, Math.min(offset, this.state.getText().length));
    // Undo and redo restore a caret the same way an edit does, and the browser
    // scrolls a focused element or a synchronised selection into view just the
    // same: keep the reader where they were.
    keepScroll(this.context, anchor);
  }

}
