/**
 * The shell's find controller: translated controls over Markdown's search API.
 *
 * Example: typing `alpha` asks `MarkdownFindApi.search` for matches, then writes
 * the returned `{ active: 1, total: 2 }` as `1 of 2` in the interface language.
 *
 * May import: the find bar, the Markdown find contract and translation. Upholds:
 * all matching and replacement mutations stay in Markdown; this module owns only
 * bar state, labels and translated status.
 */

import { t } from '../../services/i18n';
import type { FindSummary, MarkdownFindApi } from '../markdown/editing/find';
import type { FindBar } from './bar';

export class FindController {
  private readOnly = false;

  constructor(
    private readonly api: MarkdownFindApi,
    private readonly bar: FindBar
  ) {}

  /** Opens the bar and searches its current query. */
  open(showReplace: boolean): void {
    this.bar.open(showReplace && !this.readOnly);
    this.updateMatches(true);
  }

  /** A read-only document may be searched, never replaced. */
  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.api.setReadOnly(readOnly);
    this.bar.setReplaceEnabled(!readOnly);
  }

  /** Closes the bar and clears the selected match. */
  close(): void {
    this.bar.close();
    this.api.close();
  }

  /** Recomputes and optionally selects the first match. */
  updateMatches(selectFirst: boolean): void {
    this.show(this.api.search(this.bar.query, selectFirst));
  }

  /** Moves to the next or previous match. */
  next(reverse: boolean): void {
    this.show(this.api.next(reverse));
  }

  /** Replaces the active match. */
  replaceCurrent(): void {
    this.show(this.api.replaceCurrent(this.bar.query, this.bar.replacement));
  }

  /** Replaces every match in one edit. */
  replaceAll(): void {
    this.show(this.api.replaceAll(this.bar.query, this.bar.replacement));
  }

  private show(summary: FindSummary): void {
    this.bar.setStatus(
      summary.total === 0
        ? ''
        : t('find.matches', { active: summary.active, total: summary.total })
    );
  }
}
