/**
 * A card that floats beside a point in the page: the footnote preview, the completion list, and
 * every message the app has to tell the reader.
 *
 * It lives on the `document.body` rather than inside the editor's scroller, because a `fixed`
 * element inside a scroll container is only fixed while no ancestor transforms anything — and the
 * editor's page does transform. What it points at is a *box* the caller measures (a caret's range,
 * a marker, a row), so the card never learns what it is beside.
 *
 * May import: the surface base and the placement rule. Upholds: a card is where the rule says, and
 * a card with nothing to point at is in the corner.
 */

import { FloatingSurface } from './surface';
import { besidePlacement, type Box } from './placement';

/** The box of an element: what a card points at when it points at a row, a marker or a button. */
export function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export interface BesideOptions {
  /** The box it points at, read when it is shown; null for a card that hangs in the corner. */
  anchor: () => Box | null;
  /** Classes for the card beyond the chrome: its width, its padding. */
  className?: string;
  /** Told when the card goes away, whichever way it went: Escape, or a press on its own ✕. */
  onClose?: () => void;
}

export class BesideCard extends FloatingSurface {
  constructor(private readonly beside: BesideOptions) {
    super([
      'fixed',
      'z-50',
      'select-none',
      FloatingSurface.CHROME,
      beside.className ?? ''
    ]);
  }

  close(): void {
    super.close();
    this.beside.onClose?.();
  }

  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {
    const box = this.element.getBoundingClientRect();
    const { left, top } = besidePlacement(this.beside.anchor(), box, {
      width: window.innerWidth,
      height: window.innerHeight
    });
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
