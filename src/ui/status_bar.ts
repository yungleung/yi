import { BaseComponent, type Renderable } from './component';

export class StatusBar extends BaseComponent {
  private readonly leftGroup: HTMLDivElement;
  private readonly rightGroup: HTMLDivElement;

  constructor() {
    super('div', [
      'flex',
      'items-center',
      'justify-between',
      'w-full',
      'px-2',
      'py-0',
      'border-t',
      'border-base-300',
      'bg-base-200',
      'text-base-content',
      'shrink-0',
      'gap-1'
    ]);

    this.leftGroup = this.createGroup('flex', 'items-center', 'gap-1');
    this.rightGroup = this.createGroup('flex', 'items-center', 'gap-1', 'ml-auto');

    this.element.append(this.leftGroup, this.rightGroup);
  }

  addComponent(component: Renderable, placement: 'left' | 'right' = 'right', index?: number): void {
    const target = placement === 'left' ? this.leftGroup : this.rightGroup;
    const node = this.toNode(component);

    if (typeof index === 'number' && index > 0) {
      const items = Array.from(target.children);
      const insertionIndex = placement === 'right'
        ? Math.max(0, Math.min(items.length, items.length - index + 1))
        : Math.max(0, Math.min(items.length, index - 1));

      if (items.length === 0 || insertionIndex >= items.length) {
        target.appendChild(node);
      } else {
        target.insertBefore(node, items[insertionIndex]);
      }
      return;
    }

    target.appendChild(node);
  }

  private createGroup(...classes: string[]): HTMLDivElement {
    const group = document.createElement('div');
    group.className = classes.join(' ');
    return group;
  }

  private toNode(component: Renderable): HTMLElement {
    return component instanceof HTMLElement ? component : component.element;
  }
}
