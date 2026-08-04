import { appendChildren, createNodeComponent } from './create_node';
import { EditableNodeComponent, type MarkdownList, type MarkdownListItem } from './editable_node';

/** Renders a `list` node as a `<ul>` / `<ol>` element. */
export class List extends EditableNodeComponent {
  constructor(node: MarkdownList) {
    super('list', node, document.createElement(node.ordered ? 'ol' : 'ul'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `listItem` node, including GFM task-list checkboxes. */
export class ListItem extends EditableNodeComponent {
  constructor(node: MarkdownListItem) {
    super('listItem', node, document.createElement('li'));

    if (typeof node.checked !== 'boolean') {
      appendChildren(this.element, node.children);
      return;
    }

    this.element.classList.add('list-none');

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'flex items-start gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = true;
    checkbox.checked = node.checked;
    checkbox.className = 'mt-1 shrink-0';
    contentWrapper.appendChild(checkbox);

    for (const child of node.children) {
      const component = createNodeComponent(child);
      if (!component) {
        continue;
      }
      if (child.type === 'paragraph') {
        component.element.classList.add('my-0');
      }
      contentWrapper.appendChild(component.element);
    }

    this.element.appendChild(contentWrapper);
  }
}
