/**
 * Where a floating card sits: beside the box it points at, or in the window's corner when it
 * points at nothing. Pure — the caller measures, this decides — so one rule answers for the
 * footnote preview, the completion list and a message, and a check holds it in Node.
 *
 * May import: nothing. Upholds: one answer to "where does a card go", so no surface writes the
 * clamping arithmetic a second time.
 */

/** A rectangle in the window's coordinates: what a card points at, and how big it is. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How much room there is: a card's own size, or the window's. */
export interface Size {
  width: number;
  height: number;
}

/** The gap between a card and what it points at. */
export const CARD_GAP = 6;

/** How far a card keeps from the window's edges. */
export const WINDOW_MARGIN = 8;

/**
 * Where a card sits: below its anchor's left edge when it fits, above it when it does not, and
 * inside the window on every side. A null anchor is a message with nothing to point at, and hangs
 * off the window's bottom-right corner, which the same arithmetic turns into a corner column.
 */
export function besidePlacement(
  anchor: Box | null,
  card: Size,
  window: Size
): { left: number; top: number } {
  const at = anchor ?? {
    left: window.width - WINDOW_MARGIN,
    top: window.height,
    width: 0,
    height: 0
  };
  const left = Math.max(
    WINDOW_MARGIN,
    Math.min(at.left, window.width - card.width - WINDOW_MARGIN)
  );
  const below = at.top + at.height + CARD_GAP;
  const top =
    below + card.height <= window.height - WINDOW_MARGIN
      ? below
      : Math.max(WINDOW_MARGIN, at.top - card.height - CARD_GAP);
  return { left, top };
}
