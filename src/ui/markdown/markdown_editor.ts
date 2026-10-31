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
import type { AppEventName } from '../../services/app_events';
import { bibliographyManager, CITATION_UPDATED } from '../../services/bibliography';
import { documentManager } from '../../services/document_manager';
import { imageSourceCandidates } from '../image/image_urls';
import { registerEditorCommands } from './commands/editor_commands';
import {
  ensureCaretRendered,
  getCaretRange,
  getSelectionRange,
  hideCaret,
  onCaretRangeChanged,
  setSelectionRange
} from './caret/caret';
import {
  isSourceBlock,
  setSourceEntryHandler,
  sourceEntryOffset,
  withHeldShownSource
} from './source_mode';
import { ARROW_KEY_DIRECTIONS, moveCaret } from './caret/navigation';
import {
  caretOffset,
  applyEdit,
  keepScroll,
  restoreCaret,
  restoreMark,
  restoreSelection,
  showSourceAt,
  type EditorContext
} from './editing/context';
import { editorSelection, isDocumentRange, proseRoot, rangeOffsets } from './editing/selection';
import { documentOffsetAt } from './caret/offsets';
import { copySelection, pasteText } from './editing/clipboard';
import { insertCommitted } from './editing/text_commands';
import { installCompositionInput, type CompositionInput } from './editing/composition_input';
import { installLanguagePicker, setLanguageChangeHandler, setLanguagePicker } from './editing/language_picker';
import {
  installCalloutKindPicker,
  setCalloutKindChangeHandler,
  setCalloutKindPicker
} from './editing/callout_kind_picker';
import { fenceLanguageEdit } from './syntax/fence_edits';
import { calloutKindEdit } from './syntax/callouts';
import { FindBar } from './editing/find_bar';
import { FindController } from './editing/find_controller';
import { Completions } from './editing/completions';
import { installFootnotePreview } from './footnote_preview';
import { installCitationPreview } from './citation_preview';
import { watchPointerPresses } from './editing/pointer';
import { handleEditorKey, type KeyHost } from './editing/keys';
import {
  routeContextMenu,
  routeFootnoteMenu,
  routeFootnoteClick,
  routeLinkClick,
  routePointerClick,
  routeTaskClick,
  routeWikilinkClick
} from './click_routing';
import { commandForKey } from './commands/keymap';
import { MENU_COMMANDS } from './commands/menu';
import { runCommand, setEditingAllowed, type CommandId } from './commands/registry';
import { MarkdownEditorState } from './document/state';
import {
  equationBlockNumber,
  firstReference,
  referenceLabel
} from './document/reference_index';
import { VirtualBlockRenderer } from './virtual_block_renderer';
import type { DocumentView, SeenView } from '../../services/session_rules';

/** An A4 sheet's width in the CSS pixels the page is laid out in (210 mm at 96 dpi). */
const A4_WIDTH_PX = (210 * 96) / 25.4;

/** The event that says which layout the editor is drawn in, for the button that switches it. */
export const EDITOR_LAYOUT_CHANGED = 'editor_layout_changed';

/** The event that says the document's text changed, for whatever keeps a copy of it. */
export const EDITOR_EDITED = 'editor_edited';
export const INPUT_SOURCE_CHANGED = 'input_source_changed';

/** A page of A4, or the column at the width of the pane. */
export type EditorLayout = 'page' | 'auto';

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
  /**
   * Owns the raw document and maintains its blocks. It starts **empty**: a window opens on a
   * document when something asks for one — the session restoring what the reader had, a file from
   * the tree, a new note — and never on a document the app happens to carry. The first start is the
   * proof: a fresh install asked for a workspace with nothing on the page behind it, where it used
   * to open the fixture's demo document (`test/checks/layering.mjs` holds the rule).
   */
  private readonly state = new MarkdownEditorState();
  private readonly contentView: HTMLElement;
  private readonly renderer: VirtualBlockRenderer;
  private readonly context: EditorContext;
  private readonly findBar: FindBar;
  private readonly find: FindController;
  /** The system's text input seam; it holds the keyboard while the caret is here. */
  private readonly composition: CompositionInput;
  /** Keeps the page's scale in step with the width of the pane it is held in. */
  private readonly pageFitter: ResizeObserver;
  /** The scale the page is drawn at: A4 until the pane cannot hold it (`fitPage`). */
  private pageScale = 1;
  /** A4 (`page`) or the column at the pane's width (`auto`); see `styles.css`. */
  private layout: EditorLayout = 'page';
  /** A reference document is shown, not written: typing and editing commands are refused. */
  private readOnly = false;
  /** A caret offset whose block is not mounted (restored on a later sync). */
  private pendingCaretOffset: number | null = null;
  /**
   * Whether a caret has been placed in the document on screen at all.
   *
   * A document the session opens with nothing remembered is shown *without* a caret
   * (`services/session_rules.ts`), which keeps a note that opens on a picture from rendering that
   * picture's markdown. The reader's first keystroke still has to write somewhere, so it places a
   * caret at the text's own start first ({@link placeCaretForTheTextPath}) — but only while this is
   * false: a caret that was *taken away* later (a click outside the document does that) must stay
   * away, which is what makes the next keystroke write nothing.
   */
  private caretPlaced = false;
  /** The citation and wikilink lists, which own the arrows and Enter while one is open. */
  private completions!: Completions;
  /** What the key path needs of this editor (see `editing/keys.ts`). */
  private keyHost!: KeyHost;

  constructor() {
    super('div', ['relative', 'flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);

    this.contentView = document.createElement('div');
    this.contentView.className = 'markdown-scroller flex-1 min-h-0 overflow-auto';
    // The text is where the keyboard belongs — a click puts it here, and a mode laid over the
    // editor hands it back (`focusText`). WebKit makes a scroll container focusable on its own only
    // when it has something to scroll, so this says it outright.
    this.contentView.setAttribute('tabindex', '-1');
    this.contentView.dataset.layout = this.layout;
    this.appendChild(this.contentView);
    this.renderer = new VirtualBlockRenderer(this.contentView, this.state);
    // What a rendering may ask the app for: the two texts a node cannot make from its own markdown,
    // and the URLs an image destination may be. Handed in here, so the render layer imports no
    // service (see `render_context.ts`).
    this.renderer.setRenderContext({
      citation: (source, cached) =>
        cached ? bibliographyManager.formatCached(source) : bibliographyManager.format(source),
      wikilinkTitle: (target) => documentManager.getTitle(target),
      imageSources: (destination) => imageSourceCandidates(destination),
      headingId: (from) =>
        this.state.headingTargets().find((target) => target.from === from)?.id ?? null,
      referenceText: (id) => {
        const target = firstReference(this.state.referenceEntries(), id);
        return target
          ? { text: referenceLabel(target), resolved: true }
          : { text: `#${id}`, resolved: false };
      },
      figureLabelAt: (from) => {
        const target = this.state.referenceEntries().find(
          (entry) => entry.kind === 'figure' && entry.from === from
        );
        return target?.number == null ? null : referenceLabel(target);
      },
      listingLabelAt: (from) => {
        const target = this.state.referenceEntries().find(
          (entry) => entry.kind === 'listing' && entry.from === from
        );
        return target?.number == null ? null : referenceLabel(target);
      },
      tableLabelAt: (from) => {
        const target = this.state.referenceEntries().find(
          (entry) => entry.kind === 'table' && entry.from === from
        );
        return target?.number == null ? null : referenceLabel(target);
      },
      listLabelAt: (from) => {
        const target = this.state.referenceEntries().find(
          (entry) => entry.kind === 'list' && entry.from === from
        );
        return target?.number == null ? null : referenceLabel(target);
      },
      equationNumberAt: (from) => {
        const target = this.state.referenceEntries().find(
          (entry) => entry.kind === 'equation' && entry.from === from
        );
        return target === undefined ? null : equationBlockNumber(target);
      }
    });
    // The page is a fixed sheet of A4, and a pane too narrow to hold it gets a smaller page
    // rather than a sideways scroll: `fitPage` sets the scale the sheet, its margin and its
    // type are drawn at (`styles.css`), and watching the pane keeps it right when the window
    // or the workspace tree changes size.
    this.pageFitter = new ResizeObserver(() => this.fitPage());
    this.pageFitter.observe(this.contentView);
    this.fitPage();
    this.context = {
      state: this.state,
      renderer: this.renderer,
      contentView: this.contentView,
      focusText: () => this.focusText(),
      // Every edit funnels through `applyEdit`, and this is how the session behind the editor
      // hears about one: the event carries nothing, since the text is the state's.
      onChanged: (kind) => {
        void eventManager.emit(EDITOR_EDITED);
        // Ordinary typed characters and an exact committed word stay in the same input context.
        // A structural edit does not: resetting the seam around it restores the next text
        // context after the block it rebuilt has changed.
        if (kind === 'typing') {
          // A native Caps Lock burst can leave committed text in the seam's textarea.
          // An editor-handled key after it — a space above all — must end that native
          // context before the next key reaches the field, or WebKit rejects it.
          this.composition.settleNativeInput();
          this.composition.keepKeyboard();
        } else if (kind === 'commit') {
          this.composition.keepKeyboard();
        } else {
          this.composition.regainKeyboard();
        }
      }
    };
    // Revealable nodes ask the editor where the caret is in the raw document;
    // they cannot work it out themselves (see `revealable_node.ts`).
    // Source mode follows the caret: the block the caret is in shows its own
    // text (see `source_mode.ts`). A click on a block's rendering asks the
    // editor to enter it, because only the editor knows the block's text.
    onCaretRangeChanged((range) => {
      if (range !== null) {
        this.caretPlaced = true;
      }
      this.followCaret();
    });
    setSourceEntryHandler((blockElement, offset) => this.enterSource(blockElement, offset));

    // The window is rebuilt as the user scrolls; re-anchor the caret only
    // when the block it lived in was dropped, so scrolling never moves it.
    this.renderer.setSyncHooks({
      capture: () => this.pendingCaretOffset ?? caretOffset(this.context),
      // The restore puts the caret back where it already was, so the source decision cannot have
      // changed while it runs — and asking again is not harmless: `showSourceAt` would rebuild
      // this block a second time, *inside* the sync that is still running. That second build's own
      // sync finds its window without the block (the element has just been released, and the shape
      // it now needs has no remembered height), so the block is left out of the page — blank, with
      // its space in a spacer, until the window's range changes. Holding the decision is what the
      // plain write's caret placement already does for the same reason (`source_mode.ts`).
      restore: (snapshot) => withHeldShownSource(() => this.reanchorCaret(snapshot))
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

    const handleKey = (event: KeyboardEvent): void => {
      this.placeCaretForTheTextPath();
      handleEditorKey(event, this.keyHost);
    };
    this.contentView.addEventListener('keydown', handleKey);
    // Activating the app or regaining IME context can leave the keyboard on the page
    // while the editor still has a live caret. Such a key is still the reader's and
    // belongs to the same text path; a click outside has already removed the caret,
    // so it still writes nothing.
    window.addEventListener(
      'keydown',
      (event) => {
        const active = document.activeElement;
        const focusIsPage =
          active === null || active === document.body || active === document.documentElement;
        if (
          focusIsPage &&
          getCaretRange() !== null &&
          !(event.target instanceof Node && this.contentView.contains(event.target))
        ) {
          handleKey(event);
        }
      },
      true
    );
    // The routed clicks, in the order they have to run: a checkbox and a footnote
    // marker are handled before a node can place a caret where the click landed, a
    // link opened with ⌘ (Ctrl) leaves for the system's browser instead of opening
    // its source, a wikilink opened with ⌘ (Ctrl) asks the app for the document it
    // names, and a click that missed every node still places a caret.
    this.contentView.addEventListener(
      'click',
      (event) => {
        if (!this.readOnly) {
          routeTaskClick(this.context, event);
        }
      },
      true
    );
    this.contentView.addEventListener(
      'click',
      (event) => routeFootnoteClick(this.context, event),
      true
    );
    this.contentView.addEventListener('click', (event) => routeLinkClick(this.context, event), true);
    this.contentView.addEventListener('click', (event) => routeWikilinkClick(event), true);
    // Where the pointer goes down, for the click that may end a drag: a drag-selection
    // crosses blocks, and the click it ends with lands on the page, not on a node (see
    // `editing/pointer.ts`).
    watchPointerPresses(this.contentView);
    this.contentView.addEventListener('click', (event) => routePointerClick(this.context, event));
    // A click is not typing. A list belongs to the query the author is typing, so any click in the
    // document puts it away — the card's own rule (`completion_card.ts`), and the one gesture that
    // ends a list without a keystroke. It is captured because a click that lands on a node is
    // answered by that node and stops there, before it bubbles (see `click_routing.ts: pointer.ts`).
    this.contentView.addEventListener('click', () => this.completions.close(), true);
    // Resting the pointer on a footnote marker shows the note it names, in a card the
    // pointer cannot interact with (see `footnote_preview.ts`).
    installFootnotePreview(this.context);
    // Resting the pointer on a citation shows the works it stands for — their reference
    // entries, in the style and bibliography the settings name (see `citation_preview.ts`).
    installCitationPreview(this.context);
    // The context menu is routed to the table menu first, and to a footnote marker's
    // jump for the one gesture that arrives as a context menu rather than a click —
    // a Ctrl-click on macOS (see `click_routing.ts`).
    this.contentView.addEventListener('contextmenu', (event) => {
      routeFootnoteMenu(this.context, event);
      if (!this.readOnly) {
        routeContextMenu(this.context, event);
      }
    });
    this.contentView.addEventListener('copy', (event) => copySelection(this.context, event));
    this.contentView.addEventListener('paste', (event) => {
      if (this.readOnly) {
        event.preventDefault();
        return;
      }
      pasteText(this.context, event);
    });
    // The system's way in: an input method's word, dictation and the emoji panel get
    // something to compose and arrive in, and what they commit is one edit of its own
    // (see `editing/composition_input.ts` and `editing/text_commands.ts: insertCommitted`).
    this.composition = installCompositionInput(
      this.contentView,
      (text) => {
        if (this.readOnly) {
          return;
        }
        this.placeCaretForTheTextPath();
        if (insertCommitted(this.context, text)) {
          this.completions.refresh();
        }
      },
      // The word being composed is written into the line, so the block it lands in can grow
      // under it: measured again, or the spacers below would be short by the line it gained.
      (block) => this.renderer.measureEditedBlock(Number(block.dataset.lineStart))
    );
    void eventManager.on(INPUT_SOURCE_CHANGED, () => {
      this.composition.resetInputContext();
    });
    // A fenced code block's label asks for a language (`nodes/fence_label.ts`); the card that
    // answers is the app's own chrome, and the edit it makes is the pure rule's
    // (`syntax/fence_edits.ts: fenceLanguageEdit`).
    setLanguagePicker(installLanguagePicker());
    setLanguageChangeHandler((lineStart, language) => this.changeFenceLanguage(lineStart, language));
    setCalloutKindPicker(installCalloutKindPicker());
    setCalloutKindChangeHandler((lineStart, kind) =>
      this.changeCalloutKind(lineStart, kind)
    );

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
        !range.collapsed && isDocumentRange(this.context, range) ? range : null
      );
    });

    this.registerCommandEvents();
    this.completions = new Completions(this.context);
    this.keyHost = {
      context: this.context,
      composition: this.composition,
      completions: this.completions,
      readOnly: () => this.readOnly,
      shortcut: (event) => this.handleShortcut(event),
      arrow: (event) => this.handleArrowKey(event)
    };
    this.renderer.render();
    // The bibliography manager announces when its data is ready or refreshed;
    // citations render from it, so the mounted blocks are rebuilt.
    void eventManager.on(CITATION_UPDATED, () => this.refresh());
  }

  /** Loads a document and renders its first window. */
  /**
   * Draws the page at the largest scale the pane can hold, never larger than A4.
   *
   * What is left of the pane once the desk has its own margin is what the sheet may use.
   * That margin is read from the stylesheet rather than repeated here, so the two cannot
   * disagree about how much desk there is.
   */
  private fitPage(): void {
    const desk = parseFloat(getComputedStyle(this.contentView).paddingLeft) || 0;
    const available = Math.max(0, this.contentView.clientWidth - 2 * desk);
    // Rounded, so a resize that lands a third of a pixel elsewhere is not a new scale.
    // The full-width column is not a page: its measurements are the ones the document was
    // written in, at 1, whatever the pane is.
    const scale =
      this.layout === 'page' ? Math.round(Math.min(1, available / A4_WIDTH_PX) * 1000) / 1000 : 1;
    if (scale === this.pageScale) {
      return;
    }
    this.pageScale = scale;
    this.contentView.style.setProperty('--page-scale', String(scale));
    this.renderer.setPageScale(scale);
  }

  /**
   * Draws the editor as a page of A4 or as a column the width of the pane.
   *
   * The two are one attribute on the scroller: `styles.css` scopes the sheet, the desk and
   * the page's scale to `[data-layout='page']`, and `auto` is what the editor was before the
   * page — the column at the pane's width, everything measured at 1. The button that
   * switches it hears which way it went.
   */
  setLayout(layout: EditorLayout): void {
    if (this.contentView.dataset.layout === layout) {
      return;
    }
    this.layout = layout;
    this.contentView.dataset.layout = layout;
    this.fitPage();
    void eventManager.emit(EDITOR_LAYOUT_CHANGED, layout);
  }

  /**
   * Shows a reference document: navigation, selection, copy, find and export stay; anything that
   * would write the text does not. The command gate is the editor's own, so the toolbar and the
   * native menu cannot write around the keyboard.
   */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.composition.element.readOnly = readOnly;
    this.contentView.dataset.readOnly = String(readOnly);
    this.find.setReadOnly(readOnly);
    setEditingAllowed(!readOnly);
  }

  /** The layout the editor is drawn in. */
  getLayout(): EditorLayout {
    return this.layout;
  }

  setContent(content: string): void {
    // A new document is a new set of blocks and nodes: whatever was showing
    // its own source is gone, and a range that named it must not fall on
    // whatever of the new document happens to start and end at the same
    // offsets.
    showSourceAt(this.context, null);
    // A document opens at its own beginning. The view keeps the scroll it has through an
    // edit, which is right — an edit is not a request to move the page — and that used to
    // be enough here too, because a short document's content was shorter than the pane and
    // the browser clamped the old scroll away. The page is a fixed 297 mm now, so nothing
    // clamps: opening a note from a scrolled one left the reader looking at the middle of
    // the paper, with the words it holds above the window.
    this.contentView.scrollTop = 0;
    this.state.loadText(content);
    this.renderer.render();
  }

  /** The raw markdown source. */
  getContent(): string {
    return this.state.getText();
  }

  /**
   * Puts the keyboard back in the text.
   *
   * A modal over the editor — the version history — keeps the keyboard while it is open, and this
   * is the one way back; the caret itself is the session's and does not move for it.
   */
  focusText(): void {
    // Already there: focusing again is a no-op to the letter of the spec, but it is a native
    // event, and one raised in the middle of an input method's own key handling is what makes
    // it give up on the field — the second Chinese word would never compose.
    if (document.activeElement !== this.composition.element) {
      this.composition.element.focus({ preventScroll: true });
    }
  }

  /**
   * Where the reader is: the selection's two ends, and the top of the view of the document.
   *
   * The session keeps this beside a document's text, so that leaving one and coming back puts
   * the reader where they were (`services/session_rules.ts`). The selection is exact; the
   * view is a document offset (`virtual_block_renderer.ts: scrollAnchor`).
   */
  captureView(): SeenView {
    return {
      // The remembered offset first: a caret whose block the window has since dropped has a
      // range the browser has *relocated* rather than lost (`docs/architecture.md`, the four
      // offsets), and reading it back would put the reader where they never were. Null when
      // neither can say, so the session keeps the offset it already had for this document. The
      // renderer's own caret hook reads it in the same order, for the same reason.
      caret: this.pendingCaretOffset ?? caretOffset(this.context),
      to: this.selectionEnd(),
      scroll: this.renderer.scrollAnchor()
    };
  }

  /**
   * The document offset a selection ends at, or null when the reader left a plain caret — or
   * when the editor cannot see one of its ends.
   *
   * Read through the same mapping the commands edit by (`rangeOffsets`), so what the session
   * remembers and what an edit would replace cannot disagree.
   */
  private selectionEnd(): number | null {
    const range = editorSelection(this.context, true);
    if (!range || range.collapsed) {
      return null;
    }
    const offsets = rangeOffsets(this.context, range);
    return offsets && offsets.to > offsets.from ? offsets.to : null;
  }

  /**
   * Gives the text path a caret to write at, in a document that has never had one.
   *
   * A document the session opens with nothing remembered is shown without a caret
   * ({@link caretPlaced}). A keystroke still means "write here", so the first one places the caret
   * where the text starts — the position the editor would have put it in — and then the key is
   * handled as usual. Once a caret has been placed this does nothing, because a caret that was
   * *taken away* (a click outside the document does that) has to stay away: that is what makes the
   * next keystroke write nothing (`click-away-deselects.js`).
   */
  private placeCaretForTheTextPath(): void {
    if (this.caretPlaced) {
      return;
    }
    restoreCaret(this.context, 0, false);
  }

  /**
   * Puts the reader back where `captureView` found them.
   *
   * The selection goes first and the view after it, because placing it can make the browser
   * scroll it into view; the view is then asserted once more on the next frame, since that
   * scroll arrives after this one. A view whose far end cannot be drawn falls back to the
   * caret at the end it can reach.
   */
  restoreView(view: DocumentView): void {
    if (view.caret !== null) {
      // The view below is what names the place, and it is asserted two frames later; the caret
      // is being put where the document says it was, not moved by the reader, so it does not
      // scroll a page the view is about to place.
      const placed =
        view.to !== null && view.to !== view.caret
          ? restoreSelection(this.context, view.caret, view.to, false) ||
            restoreCaret(this.context, view.caret, false)
          : restoreCaret(this.context, view.caret, false);
      this.pendingCaretOffset = placed ? null : view.caret;
    } else {
      // A view that says nothing about a caret leaves the document *without* one. What the page
      // shows follows the caret, so a caret invented here would decide it — and one the previous
      // document left behind is a range the browser relocated into this one, which is a caret
      // nobody chose either. The reader's first click or keystroke places one.
      this.pendingCaretOffset = null;
      this.caretPlaced = false;
      hideCaret();
    }
    this.renderer.scrollToAnchor(view.scroll);
    const anchor = this.contentView.scrollTop;
    // Two frames, the way `keepScroll` waits out an edit: placing a caret makes the browser
    // scroll it into view, and that scroll arrives *after* the one just set here — a reader who
    // left the view a screen away from their caret gets the view they left, not the caret.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (Math.abs(this.contentView.scrollTop - anchor) > 0.5) {
          this.contentView.scrollTop = anchor;
        }
      });
    });
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
      applyHistory: (direction) => this.applyHistory(direction),
      toggleLayout: () => this.setLayout(this.layout === 'page' ? 'auto' : 'page')
    });
    // The native menu names these commands by string; the bridge is the one place
    // that knows which string means which command.
    for (const [event, command] of Object.entries(MENU_COMMANDS) as Array<[AppEventName, CommandId]>) {
      // The payload travels: the Export submenu's items are one event whose payload is the kind.
      void eventManager.on(event, (event: any) => runCommand(command, event?.payload ?? null));
    }
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
      // The caret just moved, and the keyboard has to move with it in the input method's eyes:
      // after arrow keys the next keystroke arrived as a Latin letter (`keyCode` 78, measured with
      // the real Chinese method) instead of opening a composition, exactly as it did after a click
      // and after an undo. The caret is where all three meet, so the hand-back belongs here as
      // much as there (`composition_input.ts: regainKeyboard`).
      this.composition.regainKeyboard();
    }
  }

  /**
   * Keeps the block that shows its own text in step with the caret: the block
   * holding the caret shows it, and none does when the caret is gone (see
   * `source_mode.ts`). A caret the editor cannot map yet — the block holding
   * it is being rebuilt — says nothing about where the author is, so it leaves
   * the mode as it stands; the next caret position decides.
   *
   * **A block that is showing its own text keeps it while the reader is selecting.** The change
   * this asks for rebuilds the block, which replaces the element the selected text is drawn on.
   * Measured: a drag over the first word of a fenced block emptied the selection the moment the
   * click that ended it placed the caret, because the block had been built as its own text while
   * the reader's selection was live. The ask is held back for that block alone — a run inside a
   * paragraph is not one of these, so a formatting command still gets the run it wrote shown
   * (`test/probes/format-buttons.js`, `test/probes/select-in-code-block.js`).
   */
  private followCaret(): void {
    const range = getCaretRange();
    if (!range) {
      showSourceAt(this.context, null);
      return;
    }
    const location = documentOffsetAt(this.state, range.startContainer, range.startOffset);
    if (!location) {
      return;
    }
    const block = this.state.getBlockAtOffset(location.offset);
    if (getSelectionRange() !== null && block !== null && isSourceBlock(block)) {
      return;
    }
    showSourceAt(this.context, location.offset);
  }

  /**
   * A click on a block's rendering enters the block's own text, with the caret
   * at the end of its last content line. The rendering cannot name the
   * character that was clicked, so this is the entry point that is always
   * true; the next click lands on the text, where the mapping is exact.
   *
   * Opening a source rebuilds the block it sits in, and the browser moves the view
   * for the same reason it does after an edit: measured on the demo document with
   * its thematic break just below the fold, a click on the citation above it moved
   * the scroll **24px** a frame later, with the layout unchanged and the caret on
   * screen. The reader clicked something they could see, so they stay where they
   * were — the same rule, and the same helper, the edits already use (an entry that
   * genuinely lands out of view still scrolls it in; see `keepScroll`).
   */
  private enterSource(blockElement: HTMLElement, offset: number | null): void {
    const block = this.state.getBlockAtLine(Number(blockElement.dataset.lineStart));
    if (!block) {
      return;
    }
    const within = offset ?? sourceEntryOffset(block.text);
    const anchor = this.contentView.scrollTop;
    restoreCaret(this.context, block.charStart + within);
    keepScroll(this.context, anchor);
  }

  /**
   * Keeps the caret alive across virtualized window changes: if its block
   * survived the swap only the caret span has to be re-created, and if the
   * block was dropped the offset is restored once it is mounted again.
   *
   * A caret survived only if it still names a document offset. Being connected is
   * not enough: replacing a block relocates the caret's live range to the point
   * the old element occupied — connected, sitting between blocks, and not a
   * position any edit can use (the browser relocates a range rather than dropping
   * it; see the four offsets in `docs/architecture.md`).
   */
  private reanchorCaret(snapshot: unknown): void {
    const caret = getCaretRange();
    const survived =
      caret !== null &&
      caret.startContainer.isConnected &&
      documentOffsetAt(this.state, caret.startContainer, caret.startOffset) !== null;
    if (survived) {
      this.pendingCaretOffset = null;
      ensureCaretRendered();
      return;
    }
    // A reader who has *selected* something is looking at the selection, not at the caret, and
    // a window change must not throw it away to put a caret back — restoring one is what makes
    // Select All followed by Copy come back empty when the page re-syncs under it (measured:
    // the selection a `select_all` had just made was gone 40 ms later, and the copy with it).
    // The remembered offset is kept, so the caret returns the moment they click or type.
    const selection = window.getSelection();
    const selected = proseRoot(this.context);
    if (
      selected !== null &&
      selection !== null &&
      !selection.isCollapsed &&
      selection.anchorNode !== null &&
      selected.contains(selection.anchorNode)
    ) {
      return;
    }
    const offset = this.pendingCaretOffset ?? (typeof snapshot === 'number' ? snapshot : null);
    if (offset === null) {
      return;
    }
    // Put back, not moved: the caret is where it already was, and the reader scrolled the page
    // themselves — so this placement must not scroll. It is the whole of a bug that showed while
    // scrolling up: the caret's block left the window and came back, the caret was placed again
    // a deferred frame later, and `scrollCaretIntoView` took the view to it — measured, one 24px
    // step up from the end of the demo document jumped the page **1097px**.
    this.pendingCaretOffset = restoreCaret(this.context, offset, false) ? null : offset;
  }

  /**
   * The language the reader chose for a fenced code block: the opening fence's own line, and
   * nothing else, replaced in one edit (`syntax/fence_edits.ts: fenceLanguageEdit`). The body is
   * the author's text and is left exactly as it stands.
   *
   * A newly opened fence keeps the reader's caret at the end of the opening line so the language
   * and attributes can be edited there. A choice at that edge leaves the caret there; a caret below
   * it moves by the length the choice added or took away. Both cases stay in source.
   */
  private changeFenceLanguage(lineStart: number, language: string): void {
    if (this.readOnly) {
      return;
    }
    const block = this.state.getBlockAtLine(lineStart);
    const caret = caretOffset(this.context);
    const relative =
      block === null || caret === null
        ? 0
        : Math.min(Math.max(0, caret - block.charStart), block.text.length);
    const edit = block ? fenceLanguageEdit(block.text, language, relative) : null;
    if (block === null || edit === null) {
      return;
    }
    const from = block.charStart + edit.from;
    const to = block.charStart + edit.to;
    const delta = edit.replacement.length - (edit.to - edit.from);
    const target =
      caret === null || (caret >= from && caret <= to)
        ? undefined
        : caret > to
          ? caret + delta
          : caret;
    applyEdit(this.context, from, to, edit.replacement, target);
  }

  /** The fenced-Div kind the reader chose, with the body and caret left in place. */
  private changeCalloutKind(lineStart: number, kind: string): void {
    if (this.readOnly) {
      return;
    }
    const block = this.state.getBlockAtLine(lineStart);
    const caret = caretOffset(this.context);
    const relative =
      block === null || caret === null
        ? 0
        : Math.min(Math.max(0, caret - block.charStart), block.text.length);
    const edit = block ? calloutKindEdit(block.text, kind, relative) : null;
    if (block === null || edit === null) {
      return;
    }
    const from = block.charStart + edit.from;
    const to = block.charStart + edit.to;
    const delta = edit.replacement.length - (edit.to - edit.from);
    const target =
      caret === null || (caret >= from && caret < to)
        ? undefined
        : caret > to
          ? caret + delta
          : caret;
    applyEdit(this.context, from, to, edit.replacement, target);
  }

  /** Undo/redo keeps the caret at the same document offset when it can. */
  private applyHistory(direction: 'undo' | 'redo'): void {
    const current = caretOffset(this.context) ?? this.state.getText().length;
    const anchor = this.contentView.scrollTop;
    const edit = direction === 'undo' ? this.state.undo() : this.state.redo();
    if (!edit) {
      return;
    }
    // The edit that was applied carries the mark it leaves behind — for an undo that is
    // where the change started, a caret or the selection it replaced, and for a redo
    // where it left off (see `history.ts: invert`). An edit recorded without marks — the
    // whole-document command formatting and find-and-replace use — keeps the caret where
    // it is, because those commands place their own selection afterwards.
    const length = this.state.getText().length;
    const mark = edit.after ?? { from: current, to: current };
    const target = { from: Math.min(mark.from, length), to: Math.min(mark.to, length) };
    // Undo and redo move the caret to a document offset like an edit does, so
    // the block that shows its own text is the block that offset lands in —
    // decided before the rebuild, so the block is built in the right shape.
    showSourceAt(this.context, target.to);
    this.renderer.renderChanged();
    restoreMark(this.context, target);
    // Undo and redo restore a caret the same way an edit does, and the browser
    // scrolls a focused element or a synchronised selection into view just the
    // same: keep the reader where they were.
    keepScroll(this.context, anchor);
    // An undo that leaves a *caret* hands the keyboard back the way an edit does — this path
    // never went through `onChanged`, so nothing did it before, and a field that keeps a stale
    // input context is not in the input method: measured by the reader, the first letter typed
    // after ⌘Z arrived as a Latin keystroke (`keyCode` 78, not `229`) and went into the
    // document. A *selection* is not a caret and is kept: a focus change would drop it, which
    // is `regainKeyboard`'s own rule — asked here rather than there because the highlight it
    // would drop is painted a frame later (`context.ts: restoreSelection`).
    if (target.from === target.to) {
      this.composition.regainKeyboard();
    }
    // An undo is a change like any other: whatever keeps a copy of the document has to hear it.
    void eventManager.emit(EDITOR_EDITED);
  }

}
