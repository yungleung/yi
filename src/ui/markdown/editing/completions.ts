/**
 * The lists the editor opens as the author types: a citation's keys after an `@`, the document's
 * targets after `[#` or a same-document `](#`, and the workspace's documents between `[[` and
 * `]]`.
 *
 * This is the living half of the feature: `syntax/completions.ts` says what the caret is inside
 * and which entries match, the card draws them, and what is left here is when a list is open, what
 * the arrows do, and what accepting writes. The editor asks `handleKey` *before* its own text path,
 * so an open list owns the arrows and the Enter; every other key is the text path's, and the list
 * is recomputed after it.
 *
 * May import: the context, the rules, the card, the caret's own geometry, and the app's two sources
 * of names. Upholds: a list is a view of what is being typed — it opens only where the syntax says
 * the construct can exist, and it closes when the caret leaves that query.
 */

import { bibliographyManager } from '../../../services/bibliography';
import { documentManager } from '../../../services/document_manager';
import { getCaretRange } from '../caret/caret';
import { caretRect } from '../caret/geometry';
import { CompletionCard } from '../completion_card';
import type { Box } from '../../floating/placement';
import {
  autoReferenceQuery,
  citationQuery,
  linkReferenceQuery,
  matchingChoices,
  wikilinkQuery,
  type CompletionChoice
} from '../syntax/completions';
import { referenceLabel } from '../document/reference_index';
import { applyEdit, caretOffset, type EditorContext } from './context';

export class Completions {
  private readonly card = new CompletionCard();
  private choices: CompletionChoice[] = [];
  private selected = 0;
  private from: number | null = null;
  /** Guards an answer that arrives after the author has typed on. */
  private generation = 0;

  constructor(private readonly context: EditorContext) {}

  /**
   * Answers a key the list in hand owns: the arrows move the choice, Enter or Tab accepts it,
   * Escape closes it and leaves the text. False means the key was never the list's.
   */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.card.isOpen() || this.from === null) {
      return false;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const count = Math.max(1, this.choices.length);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.selected = (this.selected + step + count) % count;
      this.draw();
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const choice = this.choices[this.selected];
      if (choice) {
        this.accept(choice);
      }
      return true;
    }
    if (event.key === 'Escape') {
      this.close();
      return true;
    }
    return false;
  }

  /**
   * Opens, refreshes or closes the list for where the caret is now. Called after every keystroke
   * the text path handled; a click that moved the caret closes the list instead (`close`, from
   * the editor's own click path), because a click is not the author typing.
   */
  refresh(): void {
    const caret = caretOffset(this.context);
    const text = this.context.state.getText();
    if (caret === null) {
      this.close();
      return;
    }
    const citation = citationQuery(text, caret);
    if (citation) {
      this.offer(
        citation.from,
        matchingChoices(
          bibliographyManager.entries().map((entry) => ({ value: entry.key, title: entry.title })),
          citation.query
        )
      );
      return;
    }
    const reference = linkReferenceQuery(text, caret) ?? autoReferenceQuery(text, caret);
    if (reference) {
      this.offer(
        reference.from,
        matchingChoices(this.referenceChoices(), reference.query)
      );
      return;
    }
    const wikilink = wikilinkQuery(text, caret);
    if (!wikilink) {
      this.close();
      return;
    }
    // A workspace is many files and the answer is a promise: the list opens with what the last
    // look found, and the entries arrive under the query they were asked for. A document's target
    // is what a wikilink writes — its frontmatter id, or its file name when it has none.
    const generation = ++this.generation;
    this.offer(
      wikilink.from,
      matchingChoices(
        this.documents().map((document) => ({ value: document.target, title: document.title })),
        wikilink.query
      )
    );
    void documentManager.documents().then((documents) => {
      if (generation !== this.generation) {
        return;
      }
      this.documentsFound = documents;
      this.selected = 0;
      this.offer(
        wikilink.from,
        matchingChoices(
          documents.map((document) => ({ value: document.target, title: document.title })),
          wikilink.query
        )
      );
    });
  }

  /** What the last look found; the list is drawn again when the answer arrives. */
  private documentsFound: { target: string; title: string }[] = [];

  private documents(): { target: string; title: string }[] {
    return this.documentsFound;
  }

  /** Every uniquely identified target in this document, in document order. */
  private referenceChoices(): CompletionChoice[] {
    const seen = new Set<string>();
    return this.context.state.referenceEntries().flatMap((entry) => {
      if (entry.id === null || seen.has(entry.id)) {
        return [];
      }
      seen.add(entry.id);
      return [{ value: entry.id, title: referenceLabel(entry) }];
    });
  }

  close(): void {
    this.from = null;
    this.choices = [];
    this.card.close();
  }

  /** Puts `choices` in front of the author, with the first in hand. */
  private offer(from: number, choices: CompletionChoice[]): void {
    this.from = from;
    this.choices = choices;
    if (this.selected >= choices.length) {
      this.selected = 0;
    }
    if (choices.length === 0) {
      this.card.close();
      return;
    }
    this.draw();
  }

  private draw(): void {
    this.card.show(this.choices, this.selected, this.caretAnchor(), (choice) => this.accept(choice));
  }

  /** Writes the choice over the query: one edit, one undo step, the caret after it. */
  private accept(choice: CompletionChoice): void {
    const caret = caretOffset(this.context);
    if (this.from === null || caret === null) {
      this.close();
      return;
    }
    const from = this.from;
    this.close();
    applyEdit(this.context, from, caret, choice.value, from + choice.value.length);
  }

  /**
   * Where the caret is, for the card to sit beside it, read from the caret's own *range* rather
   * than from the span that draws it. The span is placed on the next frame (`caret.ts:
   * scheduleCaret`) while the range moves at once, so a keystroke's own redraw would measure the
   * position the caret has already left — measured, one character's width, and the list slid there
   * on the next ArrowDown.
   */
  private caretAnchor(): Box | null {
    const range = getCaretRange();
    const caret = range ? caretRect(range) : null;
    return caret ? { left: caret.left, top: caret.top, width: 0, height: caret.height } : null;
  }
}
