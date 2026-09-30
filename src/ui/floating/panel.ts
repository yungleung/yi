/**
 * A panel that hangs under the button that opened it, inside that button's own `relative` host: the
 * stack, and the table picker.
 *
 * `absolute` rather than `fixed`, because a panel belongs to its toolbar: it moves with it, and it
 * never floats over a part of the page it has nothing to do with. It closes on Escape (from the
 * family), on a press outside it, and — the owner's business — on a pick.
 *
 * May import: the surface base. Upholds: a panel is inside its host, and the only thing outside it
 * that closes it is a press elsewhere.
 */

import { FloatingSurface } from './surface';

export interface PanelOptions {
  /**
   * Where under the button it sits: `right-0` for the stack, `left-1/2 -translate-x-1/2` for the
   * picker, and the width and padding each panel wants. Its host supplies the `relative` both are
   * positioned against.
   */
  className: string;
}

export class AnchoredPanel extends FloatingSurface {
  constructor(panel: PanelOptions) {
    super(['absolute', 'top-full', 'mt-1', 'z-50', 'select-none', FloatingSurface.CHROME, panel.className]);
    // The panel lives inside the titlebar, whose mousedown starts a window drag: every row and
    // square stops that on its own. A press anywhere else closes the panel.
    document.addEventListener('mousedown', (event) => {
      if (this.isOpen() && !this.element.contains(event.target as Node)) {
        this.close();
      }
    });
  }

  /** Its host owns it: the toolbar appends it when the toolbar is built. */
  protected mountForShow(): void {}

  /** Its place is its classes: under the button, aligned inside the host it was built into. */
  protected placeForShow(): void {}

  /** The press that opens and closes it again. */
  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }
}
