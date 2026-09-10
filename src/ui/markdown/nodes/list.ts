import { appendChildren, createComponent } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstList, AstListItem } from '../ast';

/** Renders a `list` node as a `<ul>` / `<ol>` element. */
export class List extends EditableNodeComponent {
  constructor(node: AstList) {
    super('list', node, document.createElement(node.ordered ? 'ol' : 'ul'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `listItem` node, including GFM task-list checkboxes. */
export class ListItem extends EditableNodeComponent {
  constructor(node: AstListItem) {
    super('listItem', node, document.createElement('li'));

    if (typeof node.checked !== 'boolean') {
      appendChildren(this.element, node.children);
      const paragraph = node.children.find((child) => child.type === 'paragraph');
      if (paragraph?.type === 'paragraph' && paragraph.children.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.textContent = '\u00a0';
        placeholder.dataset.textFrom = String(
          ((node as { position?: { start: { offset?: number } } }).position?.start.offset ?? 0) + 2
        );
        placeholder.className = 'markdown-list-placeholder';
        this.element.querySelector('p')?.appendChild(placeholder);
      }
      return;
    }

    this.element.classList.add('list-none');
    const position = (
      node as { position?: { start: { offset?: number } } }
    ).position?.start.offset;
    if (position !== undefined) {
      this.element.dataset.taskSourceFrom = String(position);
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'flex items-start gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = node.checked;
    checkbox.dataset.taskCheckbox = 'true';
    checkbox.className = 'mt-1 shrink-0';
    contentWrapper.appendChild(checkbox);

    for (const child of node.children) {
      const component = createComponent(child);
      if (!component) {
        continue;
      }
      if (child.type === 'paragraph') {
        component.element.classList.add('my-0');
        if (child.children.length === 0) {
          const placeholder = document.createElement('span');
          placeholder.textContent = '\u00a0';
          placeholder.dataset.textFrom = String((position ?? 0) + (node.checked ? 6 : 2));
          placeholder.className = 'markdown-list-placeholder';
          component.element.appendChild(placeholder);
        }
      }
      contentWrapper.appendChild(component.element);
    }

    this.element.appendChild(contentWrapper);
  }
}
