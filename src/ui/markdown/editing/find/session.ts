/**
 * Search and replace over the raw document.
 *
 * Example: `search("alpha", true)` finds every source occurrence even when only
 * one block is mounted, reveals the first and reports `{ active: 1, total: 2 }`.
 *
 * May import: the editing context and caret DOM mapping. Upholds: matches come
 * from the complete raw text; presentation and translated status stay outside.
 */

import { domPositionAtOffset } from '../../caret/dom_position';
import { restoreCaret, type EditorContext } from '../context';
import { proseRoot } from '../selection';

interface FindMatch {
  from: number;
  to: number;
}

/** The count a shell-owned find bar renders in its own language. */
export interface FindSummary {
  /** One-based index of the selected match, or zero when there is none. */
  readonly active: number;
  readonly total: number;
}

/** The public find operations a Markdown editor offers to shell UI. */
export interface MarkdownFindApi {
  search(query: string, selectFirst: boolean): FindSummary;
  next(reverse: boolean): FindSummary;
  replaceCurrent(query: string, replacement: string): FindSummary;
  replaceAll(query: string, replacement: string): FindSummary;
  setReadOnly(readOnly: boolean): void;
  close(): void;
}

/** Search state over one live Markdown document. */
export class MarkdownFindSession implements MarkdownFindApi {
  private matches: FindMatch[] = [];
  private activeIndex = -1;
  private readOnly = false;

  constructor(private readonly context: EditorContext) {}

  /** Recomputes matches and optionally reveals the first. */
  search(query: string, selectFirst: boolean): FindSummary {
    const source = this.context.state.getText().toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    this.matches = [];
    this.activeIndex = -1;
    if (needle) {
      let from = 0;
      while ((from = source.indexOf(needle, from)) >= 0) {
        this.matches.push({ from, to: from + query.length });
        from += Math.max(1, needle.length);
      }
      if (selectFirst && this.matches.length > 0) {
        this.activeIndex = 0;
        this.revealActive();
      }
    }
    return this.summary();
  }

  /** Moves to the next or previous match. */
  next(reverse: boolean): FindSummary {
    if (this.matches.length === 0) {
      return this.summary();
    }
    const count = this.matches.length;
    this.activeIndex = (this.activeIndex + (reverse ? -1 : 1) + count) % count;
    this.revealActive();
    return this.summary();
  }

  /** Replaces the active match with `replacement`. */
  replaceCurrent(query: string, replacement: string): FindSummary {
    if (this.readOnly) {
      return this.summary();
    }
    const match = this.matches[this.activeIndex];
    if (!match) {
      return this.search(query, false);
    }
    this.context.state.replaceRange(match.from, match.to, replacement);
    this.context.renderer.renderChanged();
    this.search(query, false);
    this.activeIndex = this.matches.findIndex((next) => next.from >= match.from);
    if (this.activeIndex < 0 && this.matches.length > 0) {
      this.activeIndex = 0;
    }
    if (this.activeIndex >= 0) {
      this.revealActive();
    }
    return this.summary();
  }

  /** Replaces every match in one document edit. */
  replaceAll(query: string, replacement: string): FindSummary {
    if (this.readOnly) {
      return this.summary();
    }
    if (this.matches.length === 0) {
      return this.search(query, false);
    }
    const source = this.context.state.getText();
    let result = '';
    let cursor = 0;
    for (const match of this.matches) {
      result += source.slice(cursor, match.from) + replacement;
      cursor = match.to;
    }
    result += source.slice(cursor);
    // Undo returns to the match the reader was on, not merely to the old text.
    const active = this.matches[this.activeIndex];
    this.context.state.setText(
      result,
      active ? { before: { from: active.from, to: active.to } } : undefined
    );
    this.context.renderer.renderChanged();
    return this.search(query, true);
  }

  /** A read-only document may be searched, never replaced. */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
  }

  /** Clears the match selection without touching the document. */
  close(): void {
    this.matches = [];
    this.activeIndex = -1;
    window.getSelection()?.removeAllRanges();
  }

  private summary(): FindSummary {
    return {
      active: this.activeIndex < 0 ? 0 : this.activeIndex + 1,
      total: this.matches.length
    };
  }

  /** Scrolls to the active match and selects it. */
  private revealActive(): void {
    const match = this.matches[this.activeIndex];
    if (!match) {
      return;
    }
    this.context.renderer.revealOffset(match.from);
    const root = proseRoot(this.context);
    if (!root) {
      return;
    }
    const citations = this.context.host.citations.renderedLength;
    const start = domPositionAtOffset(this.context.state, root, match.from, citations);
    const end = domPositionAtOffset(this.context.state, root, match.to, citations);
    if (start && end) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      restoreCaret(this.context, match.from);
    }
  }
}
