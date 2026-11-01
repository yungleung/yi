/**
 * Search and replace over the raw document.
 *
 * Matches are computed from the source text, so they cover the whole file
 * even though only part of it is mounted; revealing a match scrolls the
 * virtual window to it and selects the text.
 *
 * May import: the editing context, the caret's DOM mapping
 * (`caret/dom_position.ts`) and the bar it drives. Upholds: matches are computed
 * from the raw text, so what is found never depends on what is mounted.
 */

import { domPositionAtOffset } from '../../caret/dom_position';
import { restoreCaret, type EditorContext } from '../context';
import { proseRoot } from '../selection';
import { t } from '../../../../services/i18n';
import type { FindBar } from './bar';

interface FindMatch {
  from: number;
  to: number;
}

export class FindController {
  private matches: FindMatch[] = [];
  private activeIndex = -1;
  private readOnly = false;

  constructor(
    private readonly context: EditorContext,
    private readonly bar: FindBar
  ) {}

  /** Opens the bar, optionally with the replace row. */
  open(showReplace: boolean): void {
    this.bar.open(showReplace && !this.readOnly);
    this.updateMatches(true);
  }

  /** A read-only document may be searched, never replaced. */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.bar.setReplaceEnabled(!readOnly);
  }

  /** Closes the bar and clears the selection it created. */
  close(): void {
    this.bar.close();
    this.matches = [];
    this.activeIndex = -1;
    window.getSelection()?.removeAllRanges();
  }

  /** Recomputes the matches for the current query. */
  updateMatches(selectFirst: boolean): void {
    const query = this.bar.query;
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
    this.updateStatus();
  }

  /** Moves to the next (or previous) match. */
  next(reverse: boolean): void {
    if (this.matches.length === 0) {
      this.updateMatches(true);
      return;
    }
    const count = this.matches.length;
    this.activeIndex = (this.activeIndex + (reverse ? -1 : 1) + count) % count;
    this.revealActive();
  }

  /** Replaces the active match with the replacement text. */
  replaceCurrent(): void {
    if (this.readOnly) {
      return;
    }
    const match = this.matches[this.activeIndex];
    if (!match) {
      return;
    }
    this.context.state.replaceRange(match.from, match.to, this.bar.replacement);
    this.context.renderer.renderChanged();
    this.updateMatches(false);
    this.activeIndex = this.matches.findIndex((next) => next.from >= match.from);
    if (this.activeIndex < 0 && this.matches.length > 0) {
      this.activeIndex = 0;
    }
    if (this.activeIndex >= 0) {
      this.revealActive();
    } else {
      this.updateStatus();
    }
  }

  /** Replaces every match in one pass over the source text. */
  replaceAll(): void {
    if (this.readOnly) {
      return;
    }
    if (this.matches.length === 0) {
      return;
    }
    const replacement = this.bar.replacement;
    const source = this.context.state.getText();
    let result = '';
    let cursor = 0;
    for (const match of this.matches) {
      result += source.slice(cursor, match.from) + replacement;
      cursor = match.to;
    }
    result += source.slice(cursor);
    // One edit for the whole document, remembering the match the bar had put the author
    // on: undo replaces the text it replaced, so that mark is still a position — and a
    // selection — and the author comes back to the match they were reading. There is no
    // `after`: the matches this edit leaves behind are recomputed, and none of them is
    // the one they were on.
    const active = this.matches[this.activeIndex];
    this.context.state.setText(result, active ? { before: { from: active.from, to: active.to } } : undefined);
    this.context.renderer.renderChanged();
    this.updateMatches(true);
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
    const start = domPositionAtOffset(this.context.state, root, match.from);
    const end = domPositionAtOffset(this.context.state, root, match.to);
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
    this.updateStatus();
  }

  private updateStatus(): void {
    this.bar.setStatus(
      this.matches.length === 0
        ? ''
        : t('find.matches', { active: this.activeIndex + 1, total: this.matches.length })
    );
  }
}
