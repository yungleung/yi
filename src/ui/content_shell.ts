import { BaseComponent } from './component';

export class ContentShell extends BaseComponent {
  constructor() {
    // `relative`, because it is the box anything laid over the editor is positioned against — the
    // versions sheet covers this area and nothing else.
    super('div', ['relative', 'flex', 'flex-1', 'min-h-0', 'overflow-hidden']);
  }
}
