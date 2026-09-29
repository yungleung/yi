/**
 * The two lists the editor opens as the author types: a citation's keys after an `@`, and the
 * workspace's documents between `[[` and `]]`.
 *
 * This is the living half of the feature: `syntax/completions.ts` says what the caret is inside
 * and which entries match, the card draws them, and what is left here is when a list is open, what
 * the arrows do, and what accepting writes. The editor asks `handleKey` *before* its own text path,
 * so an open list owns the arrows and the Enter; every other key is the text path's, and the list
 * is recomputed after it.
 *
 * May import: the context, the rules, the card, and the app's two sources of names. Upholds: a list
 * is a view of what is being typed — it opens only where the syntax says the construct can exist,
 * and it closes when the caret leaves that query.
 */

import { bibliographyManager } from '../../../services/bibliography';
import { documentManager } from '../../../services/document_manager';
import { CompletionCard } from '../completion_card';
import {
  citationQuery,
  matchingChoices,
  wikilinkQuery,
  type CompletionChoice
} from '../syntax/completions';
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
    if (!this.card.open || this.from === null) {
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
   * the text path handled, and after a click that moved the caret.
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
    const wikilink = wikilinkQuery(text, caret);
    if (!wikilink) {
      this.close();
      return;
    }
    // A workspace is many files and the answer is a promise: the list opens with what the last
    // look found, and the entries arrive under the query they were asked for.
    const generation = ++this.generation;
    this.offer(
      wikilink.from,
      matchingChoices(
        this.documents().map((document) => ({ value: document.id, title: document.title })),
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
          documents.map((document) => ({ value: document.id, title: document.title })),
          wikilink.query
        )
      );
    });
  }

  /** What the last look found; the list is drawn again when the answer arrives. */
  private documentsFound: { id: string; title: string }[] = [];

  private documents(): { id: string; title: string }[] {
    return this.documentsFound;
  }

  close(): void {
    this.from = null;
    this.choices = [];
    this.card.hide();
  }

  /** Puts `choices` in front of the author, with the first in hand. */
  private offer(from: number, choices: CompletionChoice[]): void {
    this.from = from;
    this.choices = choices;
    if (this.selected >= choices.length) {
      this.selected = 0;
    }
    if (choices.length === 0) {
      this.card.hide();
      return;
    }
    this.draw();
  }

  private draw(): void {
    this.card.show(this.choices, this.selected, this.caretBox(), (choice) => this.accept(choice));
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

  /** Where the caret is drawn, for the card to sit beside it. */
  private caretBox(): DOMRect | null {
    const caret = this.context.contentView.querySelector('.markdown-caret');
    return caret?.getBoundingClientRect() ?? null;
  }
}
