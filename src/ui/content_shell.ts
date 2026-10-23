/**
 * The content area: the frame the editor panel and whatever stands beside it are laid out in.
 *
 * May import: the component base. Upholds: one home for the content's layout, so the panels around
 * the editor cannot each decide how the middle is measured.
 */

import { BaseComponent } from './component';

export class ContentShell extends BaseComponent {
  constructor() {
    // `relative`, because it is the box panels around the editor are measured and placed against.
    super('div', ['relative', 'flex', 'flex-1', 'min-h-0', 'overflow-hidden']);
  }
}
