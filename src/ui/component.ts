export interface UIComponent {
  element: HTMLElement;
  mount(parent: HTMLElement): this;
  destroy(): void;
}

export type Renderable = UIComponent | HTMLElement;

export abstract class BaseComponent implements UIComponent {
  readonly element: HTMLElement;

  constructor(tagName: string = 'div', classNames: string[] = []) {
    this.element = document.createElement(tagName);
    if (classNames.length > 0) {
      this.element.className = classNames.join(' ');
    }
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.element);
    return this;
  }

  destroy(): void {
    this.element.remove();
  }

  protected appendChild(child: Renderable): HTMLElement {
    const node = child instanceof HTMLElement ? child : child.element;
    this.element.appendChild(node);
    return node;
  }

  protected clearChildren(): void {
    this.element.replaceChildren();
  }
}
