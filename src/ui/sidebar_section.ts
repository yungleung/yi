import { BaseComponent, type Renderable } from './component';

/**
 * A titled, collapsible section that can be stacked inside a Sidebar.
 */
export class SidebarSection extends BaseComponent {
  protected readonly content: HTMLDivElement;
  private readonly title: HTMLElement;

  constructor(title: string, initiallyOpen = true) {
    super('details', ['collapse', 'collapse-arrow', 'shrink-0', 'bg-base-200']);
    (this.element as HTMLDetailsElement).open = initiallyOpen;

    this.title = document.createElement('summary');
    this.title.className = 'collapse-title min-h-0 px-3 py-1.5 text-sm font-medium after:start-1 after:end-auto pe-1 ps-5';
    this.title.textContent = title;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'collapse-content min-h-0 py-0';

    this.content = document.createElement('div');
    this.content.className = 'flex flex-col gap-1';

    contentWrapper.appendChild(this.content);
    this.element.append(this.title, contentWrapper);
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  addContent(component: Renderable): void {
    this.content.append(component instanceof HTMLElement ? component : component.element);
  }
}
