import { BaseComponent } from '../component';

/** One button of a toolbar: its name, its icon, and any classes it needs. */
export interface ToolbarButtonSpec {
  /** The tooltip and the accessible name. */
  label: string;
  /** The inline SVG, sized in `em` so the font size decides its size. */
  icon: string;
  /** Extra classes for the button — the icon size, mostly. */
  className?: string;
  /**
   * What pressing the button asks the editor for. A group whose buttons map
   * one-to-one onto commands narrows this — a formatting button is the style
   * it applies, a list button the list command it runs — and the group turns
   * that into the command id it runs. A button that does something else
   * (opening the table picker) leaves it out.
   */
  command?: string;
}

/** The size the tool icons share: one and a quarter the text around them. */
export const TOOL_ICON_SIZE = 'text-[1.25em]';

/**
 * Base class for the bars' tool groups: the titlebar's editing tools, and the one button the
 * status bar holds.
 *
 * Every group needs the same things from its buttons, and the same three rules:
 * a button is ghost-styled, it must not start a window drag, and it must not
 * take focus — the caret and the selection live in the document, and a focused
 * button would take them away. What is left for a group to say is *what* its
 * buttons are and *what pressing one means*: a press runs a command by id, and
 * the editor decides what that command does. A button never reaches into the
 * editor itself.
 */
export abstract class Toolbar extends BaseComponent {
  protected constructor(classNames: string[] = ['flex', 'items-center', 'gap-1']) {
    super('div', classNames);
  }

  /** One button, wired the way every titlebar button has to be. */
  protected addButton(spec: ToolbarButtonSpec, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = ['btn', 'btn-ghost', 'btn-xs', spec.className]
      .filter((name): name is string => Boolean(name))
      .join(' ');
    button.title = spec.label;
    button.setAttribute('aria-label', spec.label);
    button.innerHTML = spec.icon;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', onPress);
    this.element.appendChild(button);
    return button;
  }

  /**
   * One button per spec, in order. The specs carry everything the button needs
   * to look like itself, so the only thing left to say is what a press means.
   */
  protected addButtons<T extends ToolbarButtonSpec>(
    specs: readonly T[],
    onPress: (spec: T) => void
  ): void {
    for (const spec of specs) {
      this.addButton(spec, () => onPress(spec));
    }
  }
}
