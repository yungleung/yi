import { BaseComponent } from '../component';
import {
  getCaretRange,
  getSelectionRange,
  scheduleCaret,
  scheduleNativeSelection,
  setSelectionRange
} from './caret/caret';
import { ARROW_KEY_DIRECTIONS, moveCaret } from './caret/navigation';
import { eventManager } from '../../services/event_manager';
import { CITATION_UPDATED } from '../../services/bibliography';
import { FORMATTING_COMMAND, type FormattingStyle } from '../formatting_toolbar';
import { documentOffsetAt, domPositionAtOffset } from './position';
import { formatRange, type FormatUnit } from './format';
import { patchFormatDom } from './format_dom';
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
  'This demo shows GitHub-flavored markdown features such as task lists, autolinks, tables, and fenced code blocks.'
].join('\n');

export class WysiwygMarkdownEditor extends BaseComponent {
  /** Owns the raw document and maintains its blocks. */
  private readonly state = new MarkdownEditorState(DEFAULT_MARKDOWN);
  private contentView: HTMLElement;
  private readonly renderer: VirtualBlockRenderer;
  private findBar: HTMLElement | null = null;
  private findInput: HTMLInputElement | null = null;
  private replaceInput: HTMLInputElement | null = null;
  private findMatches: Array<{ from: number; to: number }> = [];
  private activeFindMatch = -1;

  constructor() {
    super('div', ['relative', 'flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);

    this.contentView = document.createElement('div');
    this.contentView.className = 'flex-1 min-h-0 overflow-auto p-4';
    this.renderer = new VirtualBlockRenderer(this.contentView, this.state);
    this.contentView.addEventListener('keydown', (event) => this.handleKeydown(event));
    this.contentView.addEventListener('click', (event) => this.handleTaskClick(event));
    this.contentView.addEventListener('copy', (event) => this.handleCopy(event));
    this.contentView.addEventListener('paste', (event) => this.handlePaste(event));
    this.appendChild(this.contentView);
    // Keep the editor's selection state in sync with the native DOM
    // selection (the prose text is selectable by dragging).
    document.addEventListener('selectionchange', () => this.syncSelection());
    // The titlebar formatting buttons edit the current selection.
    void eventManager.on(FORMATTING_COMMAND, (event) => {
      const payload = (event.payload ?? event) as { style?: FormattingStyle };
      if (payload.style) {
        this.applyFormatting(payload.style);
      }
    });
    void eventManager.on('undo', () => this.applyHistory('undo'));
    void eventManager.on('redo', () => this.applyHistory('redo'));
    void eventManager.on('cut', () => {
      void this.cutSelection();
    });
    void eventManager.on('select_all', () => this.selectAll());
    void eventManager.on('find', () => this.openFindBar(false));
    void eventManager.on('replace', () => this.openFindBar(true));

    // Blocks are parsed lazily as they enter the viewport.
    this.renderInitial();
    // The bibliography manager announces when its data is ready or refreshed;
    // the editor just re-renders the same tree.
    void eventManager.on(CITATION_UPDATED, () => this.refresh());
  }

  setContent(content: string): void {
    this.state.loadText(content);
    this.renderInitial();
  }

  getContent(): string {
    return this.state.getText();
  }

  /**
   * Re-renders the blocks. Used when the bibliography arrives after the first
   * render, so citations can switch from raw source to formatted text.
   */
  refresh(): void {
    this.renderPreview();
  }

  /** The first render, mounting only blocks near the viewport. */
  private renderInitial(): void {
    // Mount only blocks near the viewport. This prevents a math-heavy document
    // from creating thousands of persistent KaTeX nodes and listeners.
    this.renderer.render();
  }

  /**
   * Rebuilds the virtual viewport from per-block parsed slices.
   */
  private renderPreview(): void {
    this.renderer.render();
  }

  private openFindBar(showReplace: boolean): void {
    if (!this.findBar) {
      this.createFindBar();
    }
    if (this.replaceInput) {
      this.replaceInput.parentElement?.classList.toggle('hidden', !showReplace);
    }
    const replaceActions = this.findBar?.querySelector<HTMLElement>('[data-find-replace-actions]');
    replaceActions?.classList.toggle('hidden', !showReplace);
    this.findBar?.classList.remove('hidden');
    this.findInput?.focus();
    this.findInput?.select();
    this.updateFindMatches(true);
  }

  private createFindBar(): void {
    const bar = document.createElement('div');
    bar.className = 'absolute right-4 top-2 z-10 flex items-center gap-1 rounded-md bg-base-200 p-2 shadow-lg';

    const findInput = document.createElement('input');
    findInput.className = 'input input-sm input-bordered w-48';
    findInput.placeholder = 'Find in Markdown';
    findInput.addEventListener('input', () => this.updateFindMatches(true));
    findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.findNext(event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeFindBar();
      }
    });

    const replaceContainer = document.createElement('div');
    replaceContainer.className = 'hidden';
    const replaceInput = document.createElement('input');
    replaceInput.className = 'input input-sm input-bordered w-48';
    replaceInput.placeholder = 'Replace with';
    replaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.replaceCurrent();
      }
    });
    replaceContainer.append(replaceInput);

    const status = document.createElement('span');
    status.className = 'px-1 text-xs opacity-70';
    status.dataset.findStatus = 'true';
    const previous = this.findButton('Prev', () => this.findNext(true));
    const next = this.findButton('Next', () => this.findNext(false));
    const replace = this.findButton('Replace', () => this.replaceCurrent());
    const replaceAll = this.findButton('All', () => this.replaceAll());
    const replaceActions = document.createElement('div');
    replaceActions.className = 'hidden flex items-center gap-1';
    replaceActions.dataset.findReplaceActions = 'true';
    replaceActions.append(replace, replaceAll);

    const close = document.createElement('button');
    close.className = 'btn btn-ghost btn-xs';
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close find bar');
    close.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24">
        <path d="M0 0h24v24H0z" fill="none" />
        <path fill="currentColor" d="m12 12.708l-5.246 5.246q-.14.14-.344.15t-.364-.15t-.16-.354t.16-.354L11.292 12L6.046 6.754q-.14-.14-.15-.344t.15-.364t.354-.16t.354.16L12 11.292l5.246-5.246q.14-.14.345-.15q.203-.01.363.15t.16.354t-.16.354L12.708 12l5.246 5.246q.14.14.15.345q.01.203-.15.363t-.354.16t-.354-.16z" />
      </svg>`;
    close.addEventListener('click', () => this.closeFindBar());

    bar.append(findInput, replaceContainer, status, previous, next, replaceActions, close);
    this.element.appendChild(bar);
    this.findBar = bar;
    this.findInput = findInput;
    this.replaceInput = replaceInput;
  }

  private findButton(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'btn btn-ghost btn-xs';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  private updateFindMatches(selectFirst: boolean): void {
    const query = this.findInput?.value ?? '';
    this.findMatches = [];
    this.activeFindMatch = -1;
    if (query) {
      const source = this.state.getText().toLocaleLowerCase();
      const needle = query.toLocaleLowerCase();
      let from = 0;
      while ((from = source.indexOf(needle, from)) >= 0) {
        this.findMatches.push({ from, to: from + query.length });
        from += Math.max(1, needle.length);
      }
      if (selectFirst && this.findMatches.length > 0) {
        this.activeFindMatch = 0;
        this.revealFindMatch();
      }
    }
    this.updateFindStatus();
  }

  private updateFindStatus(): void {
    const status = this.findBar?.querySelector<HTMLElement>('[data-find-status]');
    if (status) {
      status.textContent = this.findMatches.length === 0
        ? ''
        : `${this.activeFindMatch + 1} of ${this.findMatches.length}`;
    }
  }

  private findNext(reverse: boolean): void {
    if (this.findMatches.length === 0) {
      this.updateFindMatches(true);
      return;
    }
    const count = this.findMatches.length;
    this.activeFindMatch = (this.activeFindMatch + (reverse ? -1 : 1) + count) % count;
    this.revealFindMatch();
  }

  private revealFindMatch(): void {
    const match = this.findMatches[this.activeFindMatch];
    if (!match) {
      return;
    }
    this.renderer.revealOffset(match.from);
    requestAnimationFrame(() => {
      const root = this.contentView.querySelector('.prose') as HTMLElement | null;
      if (!root) {
        return;
      }
      const start = domPositionAtOffset(this.state, root, match.from);
      const end = domPositionAtOffset(this.state, root, match.to);
      if (!start || !end) {
        return;
      }
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      selection.removeAllRanges();
      selection.addRange(range);
      this.updateFindStatus();
    });
  }

  private replaceCurrent(): void {
    const match = this.findMatches[this.activeFindMatch];
    const replacement = this.replaceInput?.value ?? '';
    if (!match) {
      return;
    }
    const change = this.state.replaceRange(match.from, match.to, replacement);
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.updateFindMatches(false);
    this.activeFindMatch = this.findMatches.findIndex((next) => next.from >= match.from);
    if (this.activeFindMatch < 0 && this.findMatches.length > 0) {
      this.activeFindMatch = 0;
    }
    if (this.activeFindMatch >= 0) {
      this.revealFindMatch();
    }
  }

  private replaceAll(): void {
    const replacement = this.replaceInput?.value ?? '';
    if (this.findMatches.length === 0) {
      return;
    }
    for (let index = this.findMatches.length - 1; index >= 0; index -= 1) {
      const match = this.findMatches[index];
      const change = this.state.replaceRange(match.from, match.to, replacement);
      this.renderer.renderChanged(change);
    }
    this.renderer.refreshBlockOffsets();
    this.updateFindMatches(true);
  }

  private closeFindBar(): void {
    this.findBar?.classList.add('hidden');
    window.getSelection()?.removeAllRanges();
    this.findMatches = [];
    this.activeFindMatch = -1;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (
      !event.isComposing &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'z'
    ) {
      event.preventDefault();
      this.applyHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (
      !event.isComposing &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'x'
    ) {
      event.preventDefault();
      void this.cutSelection();
      return;
    }
    if (
      !event.isComposing &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'a'
    ) {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if (
      !event.isComposing &&
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.insertNewline(event);
      return;
    }
    if (
      !event.isComposing &&
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.deleteText(event);
      return;
    }

    if (
      !event.isComposing &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.insertText(event);
      return;
    }
    const direction = ARROW_KEY_DIRECTIONS[event.key];
    if (!direction) {
      return;
    }
    if (!getCaretRange()) {
      return;
    }
    event.preventDefault();
    if (!event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
    const root = this.contentView.querySelector('.prose') as HTMLElement | null;
    if (root) {
      moveCaret(root, direction);
    }
  }

  private applyHistory(direction: 'undo' | 'redo'): void {
    const range = this.editorSelection(true);
    const start = range
      ? documentOffsetAt(this.state, range.startContainer, range.startOffset)
      : null;
    const end = range
      ? documentOffsetAt(this.state, range.endContainer, range.endOffset)
      : null;
    const fallbackOffset = start && end
      ? Math.min(start.offset, end.offset)
      : this.state.getText().length;
    const change = direction === 'undo' ? this.state.undo() : this.state.redo();
    if (!change) {
      return;
    }
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(Math.min(fallbackOffset, this.state.getText().length));
  }

  private insertNewline(event: KeyboardEvent): void {
    const range = this.editorSelection(true);
    if (!range) {
      return;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end) {
      return;
    }

    const from = Math.min(start.offset, end.offset);
    const to = Math.max(start.offset, end.offset);
    const block = start.block;
    const source = this.state.getText();
    const lineStart = source.lastIndexOf('\n', from - 1) + 1;
    const lineEndIndex = source.indexOf('\n', from);
    const lineEnd = lineEndIndex < 0 ? source.length : lineEndIndex;
    const line = source.slice(lineStart, lineEnd);
    let replacement = '\n';
    if (block.kind === 'paragraph') {
      replacement = '\n\n';
    } else if (block.kind !== 'fencedCode' && block.kind !== 'displayMath') {
      const listPrefix = /^(\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/.exec(line);
      if (listPrefix) {
        replacement = `\n${listPrefix[1]}`;
      }
    }

    event.preventDefault();
    const change = this.state.replaceRange(from, to, replacement);
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(from + replacement.length);
  }

  private handleTaskClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
      return;
    }
    const item = target.closest<HTMLElement>('[data-task-source-from]');
    const blockElement = item?.closest<HTMLElement>('.markdown-block');
    if (!item || !blockElement) {
      return;
    }
    const block = this.state.getBlockAtLine(Number(blockElement.dataset.lineStart));
    const relativeStart = Number(item.dataset.taskSourceFrom);
    if (!block || !Number.isFinite(relativeStart)) {
      return;
    }
    const source = this.state.getText();
    const lineStart = block.charStart + relativeStart;
    const lineEnd = source.indexOf('\n', lineStart);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    const marker = /^(\s*(?:[-+*]|\d+[.)])\s+)\[([ xX])\]/.exec(line);
    if (!marker) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const checkOffset = lineStart + marker[1].length + 1;
    const replacement = marker[2].toLowerCase() === 'x' ? ' ' : 'x';
    const change = this.state.replaceRange(checkOffset, checkOffset + 1, replacement);
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
  }

  private deleteText(event: KeyboardEvent): void {
    const range = this.editorSelection(true);
    if (!range) {
      return;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end) {
      return;
    }

    let from = Math.min(start.offset, end.offset);
    let to = Math.max(start.offset, end.offset);
    if (from === to) {
      if (event.key === 'Backspace') {
        from = Math.max(0, from - 1);
      } else {
        to = Math.min(this.state.getText().length, to + 1);
      }
    }
    event.preventDefault();
    if (from === to) {
      return;
    }
    const change = this.state.replaceRange(from, to, '');
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(from);
  }

  private insertText(event: KeyboardEvent): void {
    const range = this.editorSelection(true);
    if (!range) {
      return;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end) {
      return;
    }
    event.preventDefault();
    const from = Math.min(start.offset, end.offset);
    const to = Math.max(start.offset, end.offset);
    const change = this.state.replaceRange(from, to, event.key);
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(from + event.key.length);
  }

  private handleCopy(event: ClipboardEvent): void {
    const selected = this.selectedTextRange();
    if (!selected) {
      return;
    }
    event.preventDefault();
    event.clipboardData?.setData('text/plain', selected.text);
  }

  private async cutSelection(): Promise<void> {
    const selected = this.selectedTextRange();
    if (!selected) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selected.text);
    } catch (error) {
      console.error('Failed to copy cut selection to the clipboard:', error);
      return;
    }
    const change = this.state.replaceRange(selected.from, selected.to, '');
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(selected.from);
  }

  private selectedTextRange(): { from: number; to: number; text: string } | null {
    const range = this.editorSelection(false);
    if (!range) {
      return null;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end || start.offset === end.offset) {
      return null;
    }
    const from = Math.min(start.offset, end.offset);
    const to = Math.max(start.offset, end.offset);
    return { from, to, text: this.state.getText().slice(from, to) };
  }

  private selectAll(): void {
    const root = this.contentView.querySelector('.prose') as HTMLElement | null;
    if (!root) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    root.focus({ preventScroll: true });
  }

  private handlePaste(event: ClipboardEvent): void {
    const replacement = event.clipboardData?.getData('text/plain');
    if (replacement === undefined) {
      return;
    }
    const range = this.editorSelection(true);
    if (!range) {
      return;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end) {
      return;
    }
    event.preventDefault();
    const from = Math.min(start.offset, end.offset);
    const to = Math.max(start.offset, end.offset);
    const change = this.state.replaceRange(from, to, replacement);
    this.renderer.renderChanged(change);
    this.renderer.refreshBlockOffsets();
    this.restoreCaret(from + replacement.length);
  }

  /**
   * Returns the browser selection when it is inside the editor. Paste also
   * accepts the logical caret because a collapsed native selection is cleared
   * when the editor's custom caret is shown.
   */
  private editorSelection(allowCollapsed: boolean): Range | null {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (
        this.contentView.contains(range.commonAncestorContainer) &&
        (allowCollapsed || !range.collapsed)
      ) {
        return range;
      }
    }
    if (allowCollapsed) {
      const caret = getCaretRange();
      if (caret && this.contentView.contains(caret.commonAncestorContainer)) {
        return caret;
      }
    }
    return null;
  }

  private restoreCaret(offset: number): void {
    const root = this.contentView.querySelector('.prose') as HTMLElement | null;
    if (!root) {
      return;
    }
    const position = domPositionAtOffset(this.state, root, offset);
    if (!position) {
      setSelectionRange(null);
      window.getSelection()?.removeAllRanges();
      return;
    }
    const caret = document.createRange();
    caret.setStart(position.node, position.offset);
    caret.collapse(true);
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    scheduleCaret(caret);
  }

  /**
   * Applies a formatting style to the current selection: maps the DOM
   * selection to raw offsets, edits the raw document with the style's
   * markers, patches or re-renders the block, and restores the selection
   * over the formatted text.
   */
  private applyFormatting(style: FormattingStyle): void {
    const range = getSelectionRange();
    if (!range || range.collapsed) {
      return;
    }
    const start = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    const end = documentOffsetAt(this.state, range.endContainer, range.endOffset);
    if (!start || !end || start.offset === end.offset) {
      return;
    }
    let from = Math.min(start.offset, end.offset);
    let to = Math.max(start.offset, end.offset);
    const text = this.state.getText();
    // Natural drags often include adjacent whitespace; ignore it so the
    // formatting targets exactly the selected content.
    while (from < to && /\s/.test(text[from])) {
      from += 1;
    }
    while (to > from && /\s/.test(text[to - 1])) {
      to -= 1;
    }
    if (from === to) {
      return;
    }
    // A selection covering a whole formatted unit (e.g. the entire content of
    // `***x***` or of an inline code span) formats the whole unit, so stacked
    // styles can be toggled off in any order and a new style wraps the unit.
    const unit = this.coveredFormattingUnit(range, range.toString().trim());
    const unitRange = unit ? this.unitRange(unit) : undefined;
    const edit = formatRange(text, from, to, style, unitRange);
    this.state.setText(edit.text);
    if (start.block.lineStart === end.block.lineStart) {
      // Patch the rendered block in place when possible: re-rendering the
      // whole block forces a document-wide layout (~1s on large files).
      // Selections the patch cannot represent fall back to the re-render.
      const root = this.contentView.querySelector('.prose') as HTMLElement | null;
      const patched = root !== null && patchFormatDom(this.state, root, style, edit);
      if (!patched) {
        this.renderer.renderBlock(start.block.lineStart);
      }
    } else {
      // Formatting only changes the two endpoint blocks. The raw markers can
      // span blank lines, but blocks in between retain both their source and
      // their block-relative AST positions, so rebuilding the entire document
      // would needlessly re-render every math widget.
      this.renderFormattingBlocks(start.block.lineStart, end.block.lineStart);
    }
    if (start.block.lineStart === end.block.lineStart) {
      this.renderer.refreshBlockOffsets();
    }
    this.restoreSelection(edit.from, edit.to);
  }

  /**
   * Re-selects the formatted range in the re-rendered document and anchors
   * the caret at its end, so further formatting can be applied in sequence.
   */
  private restoreSelection(from: number, to: number): void {
    const root = this.contentView.querySelector('.prose') as HTMLElement | null;
    if (!root) {
      return;
    }
    const startPos = domPositionAtOffset(this.state, root, from);
    const endPos = domPositionAtOffset(this.state, root, to);
    if (!startPos || !endPos) {
      return;
    }
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    const caret = document.createRange();
    caret.setStart(endPos.node, endPos.offset);
    caret.collapse(true);
    // The editor's selection state is updated synchronously so the next
    // formatting command sees it immediately; only the visible highlight
    // and the caret geometry are deferred (both are expensive to apply
    // right after the block re-render).
    setSelectionRange(range);
    // The block was just re-rendered, so its DOM is fresh; measuring the
    // caret rect immediately would force a full layout. Defer the geometry
    // to the next frame so the formatting click returns quickly.
    scheduleCaret(caret);
    // Applying the native selection forces selection painting, the dominant
    // cost of a formatting edit on large documents; schedule it after the
    // current frame so the formatted text paints first.
    scheduleNativeSelection(range);
  }

  /**
   * The outermost inline formatting element (em/strong/del/code) whose
   * rendered content the selection anchors to — the selection equals it, or
   * starts/ends at its edges and extends past it with adjacent characters
   * (natural drags include them). A partial selection inside a unit formats
   * only what is selected. The raw range of the whole unit (including its
   * hidden markers) is then the edit target.
   */
  private coveredFormattingUnit(range: Range, selectedText: string): HTMLElement | null {
    const anchored = (element: Element): boolean => {
      const content = element.textContent ?? '';
      return (
        content.length > 0 &&
        (selectedText === content ||
          selectedText.startsWith(content) ||
          selectedText.endsWith(content))
      );
    };
    const candidates: HTMLElement[] = [];
    // Units inside the selection's subtree (a selection extending past a
    // unit has the containing paragraph as its common ancestor).
    const scan = (root: Node): void => {
      if (root.nodeType === Node.ELEMENT_NODE) {
        const element = root as Element;
        if (element.hasAttribute('data-format-from') && anchored(element)) {
          candidates.push(element as HTMLElement);
        }
        for (const child of element.children) {
          scan(child);
        }
      }
    };
    scan(range.commonAncestorContainer);
    // Units on the ancestor chain (a selection inside a unit's text).
    let node: Node | null = range.commonAncestorContainer.parentNode;
    while (node && node !== this.contentView) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).hasAttribute('data-format-from') &&
        anchored(node as Element)
      ) {
        candidates.push(node as HTMLElement);
      }
      node = node.parentNode;
    }
    // The outermost candidate (the one containing the others).
    return (
      candidates.find(
        (candidate) => candidates.every((other) => candidate === other || candidate.contains(other))
      ) ?? null
    );
  }

  /** The raw range of a formatting unit and of its rendered text. */
  private unitRange(unit: HTMLElement): FormatUnit {
    // The tags are block-relative; the global offsets add the block's
    // charStart (refreshed on every edit).
    const blockElement = unit.closest('.markdown-block') as HTMLElement | null;
    const block = blockElement
      ? this.state
          .getBlocks()
          .find((b) => String(b.lineStart) === blockElement.dataset.lineStart)
      : null;
    const base = block?.charStart ?? 0;
    const textSpans = unit.querySelectorAll<HTMLElement>('[data-text-from]');
    const first = textSpans[0];
    const last = textSpans[textSpans.length - 1];
    return {
      from: base + Number(unit.dataset.formatFrom),
      to: base + Number(unit.dataset.formatTo),
      contentFrom: first ? base + Number(first.dataset.textFrom) : base + Number(unit.dataset.formatFrom),
      contentTo: last
        ? base + Number(last.dataset.textFrom) + (last.firstChild as Text).data.length
        : base + Number(unit.dataset.formatTo)
    };
  }

  /**
   * Re-renders only the blocks whose source changed during a formatting edit.
   * Inline formatting never adds/removes lines, so line numbers remain stable;
   * only character starts after the edit need to be refreshed.
   */
  private renderFormattingBlocks(startLine: number, endLine: number): void {
    const firstLine = Math.min(startLine, endLine);
    const lastLine = Math.max(startLine, endLine);
    for (const block of this.state.getBlocks()) {
      if (block.lineStart === firstLine || block.lineStart === lastLine) {
        this.renderer.renderBlock(block.lineStart);
      }
    }
    this.renderer.refreshBlockOffsets();
  }

  /**
   * Mirrors the browser's current selection into the editor state when it is
   * a non-collapsed range inside the editor content.
   */
  private syncSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectionRange(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed || !this.contentView.contains(range.commonAncestorContainer)) {
      setSelectionRange(null);
      return;
    }
    setSelectionRange(range);
  }
}
