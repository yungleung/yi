/**
 * The title bar: the window's own controls, the menu-ish buttons, and the document's title where it
 * is not the system's.
 *
 * May import: the window API and the component base. Upholds: the window's chrome is one component,
 * so the app's own title bar and the system's cannot both try to own the top strip.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { BaseComponent, type Renderable } from './component';

export class TitleBar extends BaseComponent {
  private readonly leftGroup: HTMLDivElement;
  private readonly centerGroup: HTMLDivElement;
  private readonly rightGroup: HTMLDivElement;

  constructor(platformName: string) {
    super('div', [
      'titlebar',
      'flex',
      'items-center',
      'justify-between',
      'w-full',
      'px-3',
      'border-b',
      'border-base-300',
      'bg-base-200',
      'text-base-content',
      'shrink-0',
      'select-none',
      'gap-3'
    ]);

    this.leftGroup = this.createGroup('flex', 'items-center', 'gap-2');
    this.centerGroup = this.createGroup('flex', 'items-center', 'justify-center', 'flex-1');
    this.rightGroup = this.createGroup('flex', 'items-center', 'gap-2', 'ml-auto');

    this.element.style.height = this.resolveHeight(platformName);
    this.element.classList.add('cursor-default');
    this.element.setAttribute('data-tauri-drag-region', 'true');
    this.element.append(this.leftGroup, this.centerGroup, this.rightGroup);

    this.element.addEventListener('mousedown', (event) => {
      if (event.target === this.element || this.element.contains(event.target as Node)) {
        this.startDragging();
      }
    });
  }

  addComponent(component: Renderable, placement: 'left' | 'center' | 'right' = 'right'): void {
    const target = placement === 'left' ? this.leftGroup : placement === 'center' ? this.centerGroup : this.rightGroup;
    target.append(this.toNode(component));
  }

  private createGroup(...classes: string[]): HTMLDivElement {
    const group = document.createElement('div');
    group.className = classes.join(' ');
    return group;
  }

  private resolveHeight(platformName: string): string {
    const normalized = platformName.toLowerCase();
    if (normalized === 'windows') {
      return '40px';
    }

    return '30px';
  }

  private startDragging(): void {
    void getCurrentWindow().startDragging();
  }

  private toNode(component: Renderable): HTMLElement {
    return component instanceof HTMLElement ? component : component.element;
  }
}
