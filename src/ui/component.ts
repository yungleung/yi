/**
 * The component contract every widget in the shell implements: an element, `mount`, `destroy`, and
 * the small helpers a subclass needs to build its own children.
 *
 * May import: nothing. Upholds: one base for the shell's widgets, so a widget is always something
 * that can be mounted and taken away by the same two calls.
 */

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
