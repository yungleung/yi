import { BaseComponent } from '../component';
import { eventManager } from '../../services/event_manager';
import { CITATION_UPDATED } from '../../services/bibliography';
import { FORMATTING_COMMAND, type FormattingStyle } from '../formatting_toolbar';
import { ensureCaretRendered, getCaretRange, setSelectionRange } from './caret/caret';
import { ARROW_KEY_DIRECTIONS, moveCaret } from './caret/navigation';
import {
  caretOffset,
  keepScroll,
  proseRoot,
  restoreCaret,
  type EditorContext
} from './editing/context';
import { copySelection, cutSelection, pasteText, selectAll } from './editing/clipboard';
import { deleteText, insertNewline, insertText, toggleTask } from './editing/text_commands';
import { applyFormatting } from './editing/formatting';
import { FindBar } from './editing/find_bar';
import { FindController } from './editing/find_controller';
import { placeCaretFromPointer } from './editing/pointer';
import {
  exitTableBelow,
  insertTable,
  tableSnapshot,
  moveTableCell,
  runTableCommand,
  type TableCommand,
  type TableTarget
} from './editing/table';
import { TABLE_COMMAND, showTableMenu } from '../table/table_menu';
import { tableMenuModel } from '../table/table_menu_model';
import { TABLE_INSERT } from '../table/table_toolbar';
import { MarkdownEditorState } from './state';
import { VirtualBlockRenderer } from './virtual_block_renderer';

const DEFAULT_MARKDOWN = [
  '# GitHub-flavored markdown demo',
  '',
  'This paragraph has *italic*, **bold**, ***both*** text, plus `inline code` and ~~strikethrough~~.',
  '',
  '## Task lists',
  '',
  '- [x] Completed task',
  '- [ ] Pending task',
  '- [ ] Another pending task with a [link](https://example.com)',
  '- [ ] ',
  '',
  '## Lists and links',
  '',
  '- Unordered list item',
  '- Another item with an autolink: https://example.com',
  '  - Nested item',
  '  - ',
  '',
  '1. Ordered list item',
  '2. Another ordered item',
  '',
  '## Blockquotes and code',
  '',
  '> A blockquote with a [link](https://example.com)',
  '',
  '```ts',
  'function greet(name: string) {',
  '  console.log(`Hello, ${name}`);',
  '}',
  '```',
  '',
  '## Tables',
  '',
  '| Column 1 | Column 2 | Column 3 |',
  '| --- | --- | --- |',
  '| Alpha | Beta | Gamma |',
  '| Delta | Epsilon | Zeta |',
  '',
  '## Math expressions',
  '',
  'Inline math: $E = mc^2$ and $\\int_a^b x^2 \\, dx$.',
  '',
  'Display math:',
  '',
  '$$',
  '\\frac{d}{dx}(\\sin x) = \\cos x \\\\ \\frac{d}{dx}(\\cos x) = -\\sin x \\\\',
  'e^{i 2\\pi} = 1',
  '$$',
  '',
  '## Footnotes and definition lists',
  '',
  'Here is a sentence with a footnote.[^1]',
  '',
  '[^1]: This is the footnote content rendered as a definition-style note.',
  '',
  'Term one',
  '',
  ': Definition for the first term.',
  '',
  'Term two',
  '',
  ': Definition for the second term that can include a [link](https://example.com).',
  '',
  '## Images and separators',
  '',
  '![A sample image](https://placehold.co/200x80/png)',
  '',
  '## Citations',
  '',
  'Pandoc-style citations: [@Abel2024], with locator [@Abel2024, p. 45],',
  'suppressed author [-@Abel2024], and multiple [see @Abel2024; also @2014, ch. 3].',
  'Narrative citations: according to @Abel2024, code reviews matter;',
  'with a locator @Abel2024 [p. 33], suppressed -@Abel2024.',
  'Keys missing from the bibliography stay raw: [@smith2020] and @jones2019.',
  'emails like contact@example.com are not citations.',
  'An escaped one \\@literal stays literal, while [a link](https://example.com) is not a citation.',
  '',
  '## Wikilinks',
  '',
  'Wikilinks resolve inside the workspace: [[虚无与生发]] renders the target’s heading 1,',
  '[[6 Bayesian Game]] resolves by name, [[20221031105857]] resolves by frontmatter id,',
  '[[Language and Thought]] falls back to the frontmatter title,',
  '[[虚无与生发|My Custom Title]] uses the explicit title, and [[nonexistent-note]] stays as typed.',
  '',
  '---',
  '',
  'This demo shows GitHub-flavored markdown features such as task lists, autolinks, tables, and fenced code blocks.',
  ''
].join('\n');

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
  private readonly state = new MarkdownEditorState(DEFAULT_MARKDOWN);
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
    // Checkbox clicks must be handled before the node components stop the
    // event from bubbling to the editor.
    this.contentView.addEventListener('click', (event) => this.handleTaskClick(event), true);
    // Clicks that miss every markdown node still place the caret: the margin
    // between blocks and the space below the text are lines, not dead zones.
    this.contentView.addEventListener('click', (event) => this.handlePointerClick(event));
    this.contentView.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
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
    void eventManager.on(FORMATTING_COMMAND, (event) => {
      const payload = (event.payload ?? event) as { style?: FormattingStyle };
      if (payload.style) {
        applyFormatting(this.context, payload.style);
      }
    });
    void eventManager.on('undo', () => this.applyHistory('undo'));
    void eventManager.on('redo', () => this.applyHistory('redo'));
    void eventManager.on('cut', () => void cutSelection(this.context));
    void eventManager.on('select_all', () => selectAll(this.context));
    void eventManager.on('find', () => this.find.open(false));
    void eventManager.on('replace', () => this.find.open(true));
    void eventManager.on(TABLE_INSERT, (event) => {
      const payload = (event.payload ?? event) as { rows?: number; columns?: number };
      if (payload.rows && payload.columns) {
        insertTable(this.context, { rows: payload.rows, columns: payload.columns });
      }
    });
    void eventManager.on(TABLE_COMMAND, (event) => {
      const payload = (event.payload ?? event) as { target?: TableTarget; command?: TableCommand };
      if (payload.target && payload.command) {
        runTableCommand(this.context, payload.target, payload.command);
      }
    });
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
      if (moveTableCell(this.context, event.shiftKey ? -1 : 1)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Shift+Enter in the table's last cell leaves the table: an empty
      // paragraph below it, like Enter at the end of any other block.
      if (event.shiftKey) {
        if (exitTableBelow(this.context)) {
          event.preventDefault();
        }
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
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
      return false;
    }
    switch (event.key.toLowerCase()) {
      case 'z':
        event.preventDefault();
        this.applyHistory(event.shiftKey ? 'redo' : 'undo');
        return true;
      case 'x':
        event.preventDefault();
        void cutSelection(this.context);
        return true;
      case 'a':
        event.preventDefault();
        selectAll(this.context);
        return true;
      default:
        return false;
    }
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
    this.renderer.renderChanged();
    restoreCaret(this.context, Math.min(offset, this.state.getText().length));
    // Undo and redo restore a caret the same way an edit does, and the browser
    // scrolls a focused element or a synchronised selection into view just the
    // same: keep the reader where they were.
    keepScroll(this.context, anchor);
  }

  /** Toggles a task-list checkbox without moving the caret. */
  private handleTaskClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
      return;
    }
    if (toggleTask(this.context, target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** Places the caret for a click that no markdown node handled. */
  private handlePointerClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.markdown-node')) {
      return;
    }
    placeCaretFromPointer(this.context, event.clientY);
  }

  /**
   * A right-click inside a table cell opens the table's menu on that cell.
   *
   * The cell is captured *before* the menu opens: the native menu takes focus,
   * so the command that follows has to be told what it acts on.
   */
  private handleContextMenu(event: MouseEvent): void {
    const cell = (event.target as Element | null)?.closest<HTMLElement>('[data-table-cell]');
    if (!cell) {
      return;
    }
    // The webview has its own context menu; ours replaces it.
    event.preventDefault();
    const blockElement = cell.closest('.markdown-block') as HTMLElement | null;
    const lineStart = Number(blockElement?.dataset.lineStart);
    const [row, column] = (cell.dataset.tableCell ?? '').split(':').map(Number);
    if (!Number.isFinite(lineStart) || !Number.isFinite(row) || !Number.isFinite(column)) {
      return;
    }
    const target: TableTarget = { lineStart, row, column };
    const snapshot = tableSnapshot(this.context, target);
    if (!snapshot) {
      return;
    }
    void showTableMenu(tableMenuModel(snapshot.source, row, column), target, {
      x: event.clientX,
      y: event.clientY
    });
  }
}
