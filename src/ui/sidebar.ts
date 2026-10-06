/**
 * The sidebar: the sections a reader can fold, and where they are put.
 *
 * May import: the component base and the catalogue. Upholds: one sidebar per window, whose sections
 * are added to it rather than positioned by whoever made them.
 */

import { t } from '../services/i18n';
import { BaseComponent } from './component';
import { SidebarSection } from './sidebar_section';

export class Sidebar extends BaseComponent {
  private readonly content: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private isOpen = true;
  private width = 200;

  private readonly toggleButtonOpenIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M6 21a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3zM18 5h-8v14h8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1"/></svg>';
  private readonly toggleButtonCloseIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm5-2v16"/></svg>';

  constructor() {
    super('aside', ['flex', 'flex-col', 'border-r', 'border-base-300', 'bg-base-200', 'h-full', 'shrink-0', 'transition-all']);
    this.element.style.width = `${this.width}px`;

    this.content = document.createElement('div');
    this.content.className = 'flex flex-1 flex-col gap-1 overflow-auto py-2';

    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'btn btn-ghost btn-sm m-2 relative z-10';
    this.toggleButton.style.marginLeft = '150px';
    this.toggleButton.style.marginRight = '0';
    this.toggleButton.style.flexShrink = '0';
    this.toggleButton.innerHTML = this.isOpen ? this.toggleButtonOpenIcon : this.toggleButtonCloseIcon;
    this.toggleButton.title = t('sidebar.toggle');
    this.toggleButton.addEventListener('click', () => this.toggle());

    this.element.append(this.toggleButton, this.content);
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.element);
    return this;
  }

  addSection(section: SidebarSection): void {
    this.content.appendChild(section.element);
  }

  attachToTitleBar(titleBar: HTMLElement): void {
    titleBar.prepend(this.toggleButton);
  }

  getWidth(): number {
    return this.width;
  }

  setWidth(width: number): void {
    this.width = Math.min(420, Math.max(180, width));
    this.element.style.width = `${this.width}px`;
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    this.element.classList.toggle('hidden', !this.isOpen);
    this.element.style.width = this.isOpen ? `${this.width}px` : '0px';
    this.toggleButton.innerHTML = this.isOpen ? this.toggleButtonOpenIcon : this.toggleButtonCloseIcon;
  }

}
