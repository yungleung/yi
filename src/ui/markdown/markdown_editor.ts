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
import { createBlockComponent, createDocumentView } from './create_block';
import type { BlockNode } from './blocks';

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
  '',
  '## Lists and links',
  '',
  '- Unordered list item',
  '- Another item with an autolink: https://example.com',
  '  - Nested item',
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

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);

    this.contentView = document.createElement('div');
    this.contentView.className = 'flex-1 min-h-0 overflow-auto p-4';
    this.contentView.addEventListener('keydown', (event) => this.handleKeydown(event));
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

    // The initial render uses the whole-document parse; every later render
    // parses each block independently (see `renderPreview`).
    this.renderInitial();
    // The bibliography manager announces when its data is ready or refreshed;
    // the editor just re-renders the same tree.
    void eventManager.on(CITATION_UPDATED, () => this.refresh());
  }

  setContent(content: string): void {
    // Loading a new document parses it once as a whole; edits later go
    // through the per-block path (`setText` + `renderBlock`).
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
    // While the document is untouched, re-render from the whole-document
    // parse (fast); after edits only the per-block path is valid.
    if (this.state.isDirty()) {
      this.renderPreview();
    } else {
      this.renderInitial();
    }
  }

  /** The first render, slicing blocks out of the whole-document parse. */
  private renderInitial(): void {
    const scrollTop = this.contentView.scrollTop;
    const root = createDocumentView(this.state.getBlockTree(), this.state.getParse());
    root.element.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full';
    root.element.tabIndex = 0;
    root.element.classList.add('outline-none');
    this.contentView.replaceChildren(root.element);
    this.contentView.scrollTop = scrollTop;
  }

  /**
   * Re-renders every block from its own parsed slice (block-relative
   * positions). Used after edits, bibliography updates, and any full re-render
   * — the whole-document parse is never maintained across edits.
   */
  private renderPreview(): void {
    const scrollTop = this.contentView.scrollTop;
    const root = document.createElement('div');
    root.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full';
    root.tabIndex = 0;
    root.classList.add('outline-none');
    for (const block of this.state.getBlocks()) {
      const node: BlockNode = { ...block, type: 'block' };
      root.appendChild(createBlockComponent(node, this.state.getBlockContent(block)).element);
    }
    this.contentView.replaceChildren(root);
    this.contentView.scrollTop = scrollTop;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const direction = ARROW_KEY_DIRECTIONS[event.key];
    if (!direction) {
      return;
    }
    // Arrows only steer the caret while one is active in the editor.
    if (!getCaretRange()) {
      return;
    }

    event.preventDefault();
    // Moving the caret collapses any active selection; clear the native
    // highlight so it does not linger over the document.
    if (!event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
    const root = this.contentView.querySelector('.prose') as HTMLElement | null;
    if (root) {
      moveCaret(root, direction);
    }
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
        this.renderBlock(start.block.lineStart);
      }
    } else {
      // Formatting only changes the two endpoint blocks. The raw markers can
      // span blank lines, but blocks in between retain both their source and
      // their block-relative AST positions, so rebuilding the entire document
      // would needlessly re-render every math widget.
      this.renderFormattingBlocks(start.block.lineStart, end.block.lineStart);
    }
    if (start.block.lineStart === end.block.lineStart) {
      this.refreshBlockOffsets();
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

  /** Re-renders only the block starting at `lineStart`. */
  private renderBlock(lineStart: number): void {
    const block = this.state.getBlockAtLine(lineStart);
    if (!block) {
      return;
    }
    const node: BlockNode = { ...block, type: 'block' };
    const component = createBlockComponent(node, this.state.getBlockContent(block));
    const old = this.contentView.querySelector<HTMLElement>(
      `.markdown-block[data-line-start="${lineStart}"]`
    );
    if (old) {
      old.replaceWith(component.element);
    } else {
      this.contentView.querySelector('.prose')?.appendChild(component.element);
    }
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
        this.renderBlock(block.lineStart);
      }
    }
    this.refreshBlockOffsets();
  }

  /** Keeps DOM block metadata aligned after an edit shifts later offsets. */
  private refreshBlockOffsets(): void {
    const root = this.contentView.querySelector('.prose');
    if (!root) {
      return;
    }
    const elements = new Map<number, HTMLElement>();
    for (const element of root.querySelectorAll<HTMLElement>('.markdown-block')) {
      const lineStart = Number(element.dataset.lineStart);
      if (Number.isFinite(lineStart)) {
        elements.set(lineStart, element);
      }
    }
    for (const block of this.state.getBlocks()) {
      const element = elements.get(block.lineStart);
      if (element) {
        element.dataset.charStart = String(block.charStart);
      }
    }
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
