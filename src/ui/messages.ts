/**
 * What the app has to tell the reader, as cards beside the thing they are about.
 *
 * One `BesideCard` per message: beside the tree row of the file it names, beside the button that
 * ran the command, or in the window's corner when it names nothing this window can show. Messages
 * for the same place stack — each card hangs under the one already there — because two failures at
 * once must not land on top of each other.
 *
 * May import: the message service, the app's events, its words and the floating cards. Upholds: a
 * message is drawn from the event and nothing else, and the reader may always read it — nothing
 * disappears on its own.
 */

import { eventManager } from '../services/event_manager';
import { t } from '../services/i18n';
import { MESSAGE_EVENT, placeSelector, type Message, type MessagePlace } from '../services/messages';
import { BesideCard, boxOf } from './floating/beside';
import type { Box } from './floating/placement';

/** The box of the element a place names, or null when this window cannot show it. */
function boxOfPlace(place: MessagePlace | undefined): Box | null {
  const selector = placeSelector(place);
  const element = selector === null ? null : document.querySelector(selector);
  return element ? boxOf(element) : null;
}

/** Whether two messages want the same place: both nowhere, the same file, or the same button. */
function samePlace(left: MessagePlace | undefined, right: MessagePlace | undefined): boolean {
  if (!left || !right) {
    return !left && !right;
  }
  if ('path' in left && 'path' in right) {
    return left.path === right.path;
  }
  if ('command' in left && 'command' in right) {
    return left.command === right.command;
  }
  return false;
}

/** The messages on screen: their cards, and the place each of them is showing for. */
class MessageCards {
  private readonly showing: { card: BesideCard; place: MessagePlace | undefined }[] = [];

  /** One card for one message, under the last card already showing for the same place. */
  show(message: Message): void {
    const last = [...this.showing].reverse().find((held) => samePlace(held.place, message.at));
    let card: BesideCard;
    card = new BesideCard({
      anchor: last ? () => boxOf(last.card.element) : () => boxOfPlace(message.at),
      className: 'w-72 p-2 text-xs',
      // Escape and the ✕ both come through here, so the list of what is showing stays true.
      onClose: () => this.forget(card)
    });
    card.element.setAttribute('data-message', 'true');
    card.element.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.className = 'min-w-0';
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
    row.append(text, close);
    card.element.appendChild(row);
    card.open();
    this.showing.push({ card, place: message.at });
  }

  /** A card that went away leaves the list, and its element leaves the page. */
  private forget(card: BesideCard): void {
    card.destroy();
    const at = this.showing.findIndex((held) => held.card === card);
    if (at >= 0) {
      this.showing.splice(at, 1);
    }
  }
}

/** Starts listening: the toast's job, done by cards beside what they are about. */
export function installMessages(): void {
  const cards = new MessageCards();
  void eventManager.on(MESSAGE_EVENT, (event: any) => {
    cards.show((event?.payload ?? event) as Message);
  });
}
