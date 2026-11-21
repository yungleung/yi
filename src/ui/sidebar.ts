/**
 * The sidebar shell: one resizable pane with exactly one loaded view.
 *
 * Example: switching from Workspace to Contents detaches the tree and mounts the contents view;
 * both remain separate components, and neither is positioned by the shell.
 *
 * May import: the neutral sidebar contract and the component base. Upholds: the shell owns width
 * and visibility, while its caller chooses which sidebar view is mounted.
 */

import type { SidebarViewName } from '../contracts';
import { BaseComponent } from './component';

/** A component the sidebar shell can mount as its sole visible view. */
export interface SidebarView {
  readonly id: SidebarViewName;
  readonly element: HTMLElement;
  /** Runs when the shell makes this the visible view. */
  activate?(): void;
  /** Runs when the shell removes this view for another. */
  deactivate?(): void;
}

export class Sidebar extends BaseComponent {
  private readonly content: HTMLDivElement;
  private open = true;
  private width = 200;
  private current: SidebarView | null = null;

  constructor() {
    super('aside', [
      'flex',
      'flex-col',
      'border-r',
      'border-base-300',
      'bg-base-200',
      'h-full',
      'shrink-0',
      'transition-all'
    ]);
    this.element.style.width = `${this.width}px`;
    this.element.setAttribute('data-sidebar', 'true');

    this.content = document.createElement('div');
    this.content.className = 'flex flex-1 flex-col gap-1 overflow-auto py-2';
    this.content.setAttribute('data-sidebar-content', 'true');
    this.element.appendChild(this.content);
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.element);
    return this;
  }

  /** Replaces the loaded view; only the displayed view stays in the shell. */
  show(view: SidebarView): void {
    if (this.current === view) {
      return;
    }
    this.current?.deactivate?.();
    this.current = view;
    this.content.replaceChildren(view.element);
    this.element.setAttribute('data-sidebar-view', view.id);
    view.activate?.();
  }

  currentView(): SidebarViewName | null {
    return this.current?.id ?? null;
  }

  isVisible(): boolean {
    return this.open;
  }

  openSidebar(): void {
    this.setVisible(true);
  }

  /** Shows or hides the shell and reports whether it is now visible. */
  toggle(): boolean {
    this.setVisible(!this.open);
    return this.open;
  }

  getWidth(): number {
    return this.width;
  }

  setWidth(width: number): void {
    this.width = Math.min(420, Math.max(180, width));
    this.element.style.width = this.open ? `${this.width}px` : '0px';
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.element.classList.toggle('hidden', !visible);
    this.element.style.width = visible ? `${this.width}px` : '0px';
  }
}
