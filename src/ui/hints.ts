/**
 * Small things the app says beside where they happened: a path, a name or an id copied.
 *
 * A hint is not asking the reader for anything, so it does not make them dismiss it: it sits beside
 * the row it is about — a `BesideCard`, the same card the footnote preview and the completion list
 * use — and a press anywhere else takes it away, as does Escape. A second hint replaces the first,
 * because what the reader just did is the one worth reading. A failure, which *does* need their
 * attention, is a message instead (`ui/messages.ts`).
 *
 * May import: the hint service, the app's events and the floating cards. Upholds: a hint is a view
 * of the event it came from, and it never becomes something the reader has to get rid of.
 */

import { eventManager } from '../services/event_manager';
import { HINT_EVENT, hintPlaceSelector, type Hint, type HintPlace } from '../services/hints';
import { BesideCard, boxOf } from './floating/beside';
import type { Box } from './floating/placement';

/**
 * The box of the row a hint is about, or null when this window cannot show it — which is also the
 * answer for a hint that names no place at all: the card goes to the window's corner.
 */
function boxOfPlace(place: HintPlace | null): Box | null {
  if (place === null) {
    return null;
  }
  const element = document.querySelector(hintPlaceSelector(place));
  return element ? boxOf(element) : null;
}

/** The hint on screen, if there is one: at most one, because the newest is the one that counts. */
class HintCards {
  private showing: BesideCard | null = null;

  show(hint: Hint): void {
    this.dismiss();
    const card = new BesideCard({
      anchor: () => boxOfPlace(hint.at),
      className: 'w-64 p-2 text-xs',
      onClose: () => {
        if (this.showing === card) {
          this.showing = null;
        }
        // Escape *closes* a floating surface and leaves its element in the page; a hint that has
        // gone away is gone — a hidden card would be the card the next `[data-hint]` finds, and the
        // one the next hint would stack above.
        card.destroy();
      }
    });
    card.element.setAttribute('data-hint', 'true');
    card.element.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.className = 'block';
    text.setAttribute('data-hint-text', 'true');
    text.textContent = hint.text;
    card.element.appendChild(text);
    card.open();
    this.showing = card;
  }

  /** Takes the hint away, whether the reader pressed elsewhere or Escape asked for it. */
  dismiss(): void {
    const card = this.showing;
    this.showing = null;
    card?.destroy();
  }

  /** Whether a press landed inside the hint: a press on it is not a press away from it. */
  holds(target: Node | null): boolean {
    return target !== null && this.showing?.element.contains(target) === true;
  }
}

/** Starts listening: hints appear beside their row, and the next press puts them away. */
export function installHints(): void {
  const hints = new HintCards();
  void eventManager.on(HINT_EVENT, (event: any) => {
    hints.show((event?.payload ?? event) as Hint);
  });
  // The reader is not asked to dismiss a hint: pressing anywhere else does it, which is also what
  // they were about to do anyway.
  document.addEventListener('mousedown', (event) => {
    if (!hints.holds(event.target as Node | null)) {
      hints.dismiss();
    }
  });
}
