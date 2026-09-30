/**
 * What the app has to tell the reader that needs their attention, as cards in the window's corner.
 *
 * One `BesideCard` per message, each hanging above the one before it in the bottom-right corner:
 * a message belongs wherever the reader is looking, which is not where the thing it is about
 * happens to be. It waits for the reader — the ✕ at its right edge, or Escape — because a failure
 * they have not read yet should not leave on its own. Something that only has to be *noticed* is a
 * hint instead (`ui/hints.ts`): a card beside the thing it happened on, gone at the next press.
 *
 * May import: the message service, the app's events, its words and the floating cards. Upholds: a
 * message is drawn from the event and nothing else, and the reader may always read it.
 */

import { eventManager } from '../services/event_manager';
import { t } from '../services/i18n';
import { MESSAGE_EVENT, type Message } from '../services/messages';
import { BesideCard, boxOf } from './floating/beside';

/** The messages on screen: their cards, and the place each of them is showing for. */
class MessageCards {
  private readonly showing: BesideCard[] = [];

  /** One card for one message, above the last one already in the corner. */
  show(message: Message): void {
    const last = this.showing[this.showing.length - 1] ?? null;
    let card: BesideCard;
    card = new BesideCard({
      // No anchor: the corner, always — and a second message hangs above the first.
      anchor: last ? () => boxOf(last.element) : () => null,
      className: 'w-72 p-2 text-xs',
      // Escape and the ✕ both come through here, so the list of what is showing stays true.
      onClose: () => this.forget(card)
    });
    card.element.setAttribute('data-message', 'true');
    card.element.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.className = 'min-w-0 flex-1';
    text.setAttribute('data-message-text', 'true');
    text.textContent = message.text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-xs btn-circle shrink-0';
    close.setAttribute('data-message-close', 'true');
    close.setAttribute('aria-label', t('message.close'));
    close.textContent = '✕';
    close.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    close.addEventListener('click', () => card.close());
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2';
    // The text takes the width, so the ✕ is at the card's right edge however short the message is.
    row.append(text, close);
    card.element.appendChild(row);
    card.open();
    this.showing.push(card);
  }

  /** A card that went away leaves the list, and its element leaves the page. */
  private forget(card: BesideCard): void {
    card.destroy();
    const index = this.showing.indexOf(card);
    if (index >= 0) {
      this.showing.splice(index, 1);
    }
  }
}

/** Starts listening: the toast's job, done by cards in the corner that wait to be read. */
export function installMessages(): void {
  const cards = new MessageCards();
  void eventManager.on(MESSAGE_EVENT, (event: any) => {
    cards.show((event?.payload ?? event) as Message);
  });
}
