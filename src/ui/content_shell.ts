import { BaseComponent } from './component';

export class ContentShell extends BaseComponent {
  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'overflow-hidden']);
  }
}
