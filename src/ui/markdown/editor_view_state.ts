/**
 * Owns the editor's remembered caret and view across document and DOM changes.
 *
 * Example: when a scrolled-away block is unmounted, the caret's document
 * offset is remembered and restored without scrolling the reader's page.
 *
 * May import: the edit context, caret mapping, selection rules and session view
 * shapes. Upholds: a live DOM range is never mistaken for a document position.
 */

import {
  ensureCaretRendered,
  getCaretRange,
  hideCaret
} from './caret/caret';
import { documentOffsetAt } from './caret/offsets';
import {
  caretOffset,
  restoreCaret,
  restoreSelection,
  type EditorContext
} from './editing/context';
import {
  editorSelection,
  proseRoot,
  rangeOffsets
} from './editing/selection';
import type { VirtualBlockRenderer } from './virtual_block_renderer';
import type { DocumentView, SeenView } from '../../services/session_rules';

/** What the view state needs from the editor it belongs to. */
export interface EditorViewDependencies {
  readonly context: EditorContext;
  readonly renderer: VirtualBlockRenderer;
  readonly contentView: HTMLElement;
}

/**
 * Keeps the caret's remembered offset and the reader's scroll anchor together.
 *
 * Example: `capture()` returns the caret and scroll anchor the session stores;
 * `restore(view)` puts both back without a rebuild moving the page.
 */
export class EditorViewState {
  private pendingCaretOffset: number | null = null;
  private caretPlaced = false;

  constructor(private readonly editor: EditorViewDependencies) {}

  /** Records whether the native selection now holds a caret. */
  noteCaret(present: boolean): void {
    if (present) {
      this.caretPlaced = true;
    }
  }

  /** Captures the selection and view for the session. */
  capture(): SeenView {
    return {
      caret: this.caretForSnapshot(),
      to: this.selectionEnd(),
      scroll: this.editor.renderer.scrollAnchor()
    };
  }

  /** Captures the caret offset around a renderer DOM swap. */
  captureCaretOffset(): unknown {
    return this.caretForSnapshot();
  }

  /** Gives the first text-path key a caret in a document that opened without one. */
  placeForTextPath(): void {
    if (this.caretPlaced) {
      return;
    }
    restoreCaret(this.editor.context, 0, false);
  }

  /** Restores the caret/selection and scroll anchor remembered by the session. */
  restore(view: DocumentView): void {
    if (view.caret !== null) {
      const placed =
        view.to !== null && view.to !== view.caret
          ? restoreSelection(this.editor.context, view.caret, view.to, false) ||
            restoreCaret(this.editor.context, view.caret, false)
          : restoreCaret(this.editor.context, view.caret, false);
      this.pendingCaretOffset = placed ? null : view.caret;
    } else {
      this.pendingCaretOffset = null;
      this.caretPlaced = false;
      hideCaret();
    }

    this.editor.renderer.scrollToAnchor(view.scroll);
    const anchor = this.editor.contentView.scrollTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (Math.abs(this.editor.contentView.scrollTop - anchor) > 0.5) {
          this.editor.contentView.scrollTop = anchor;
        }
      });
    });
  }

  /** Re-anchors the caret after the renderer releases or replaces its block. */
  reanchor(snapshot: unknown): void {
    const caret = getCaretRange();
    const survived =
      caret !== null &&
      caret.startContainer.isConnected &&
      documentOffsetAt(
        this.editor.context.state,
        caret.startContainer,
        caret.startOffset
      ) !== null;
    if (survived) {
      this.pendingCaretOffset = null;
      ensureCaretRendered();
      return;
    }

    const selection = window.getSelection();
    const selected = proseRoot(this.editor.context);
    if (
      selected !== null &&
      selection !== null &&
      !selection.isCollapsed &&
      selection.anchorNode !== null &&
      selected.contains(selection.anchorNode)
    ) {
      return;
    }

    const offset =
      this.pendingCaretOffset ?? (typeof snapshot === 'number' ? snapshot : null);
    if (offset === null) {
      return;
    }
    this.pendingCaretOffset = restoreCaret(this.editor.context, offset, false)
      ? null
      : offset;
  }

  private caretForSnapshot(): number | null {
    return this.pendingCaretOffset ?? caretOffset(this.editor.context);
  }

  private selectionEnd(): number | null {
    const range = editorSelection(this.editor.context, true);
    if (!range || range.collapsed) {
      return null;
    }
    const offsets = rangeOffsets(this.editor.context, range);
    return offsets && offsets.to > offsets.from ? offsets.to : null;
  }
}
