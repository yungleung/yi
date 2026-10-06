/**
 * Renders `list` nodes as `<ul>`/`<ol>` and their items as `<li>`, including GFM
 * task-list checkboxes.
 *
 * May import: the node contract (`editable_node.ts`), the registry's helpers and
 * the AST types. Upholds: a block's rendering is a pure function of its own
 * source — a task item's checkbox is read from its own marker.
 */

import { appendChildren, createComponent } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstList, AstListItem } from '../ast';
import { TASK_SOURCE_FROM, TEXT_FROM, setOffset } from './../offset_tags';

export class List extends EditableNodeComponent {
  constructor(node: AstList) {
    super('list', node, document.createElement(node.ordered ? 'ol' : 'ul'), 'min-w-0');
    appendChildren(this.element, node.children);
  }
}

/** The marker-only content of a task item with nothing after it (`[ ]`). */
const MARKER_ONLY = /^\[([ xX])\]$/;

/** Renders a `listItem` node, including GFM task-list checkboxes. */
export class ListItem extends EditableNodeComponent {
  constructor(node: AstListItem) {
    super('listItem', node, document.createElement('li'));

    const markerOnly = markerOnlyChecked(node);
    const checked = typeof node.checked === 'boolean' ? node.checked : markerOnly;
    if (checked === null) {
      this.renderPlainItem(node);
    } else {
      this.renderTaskItem(node, checked, markerOnly !== null);
    }
  }

  /** A regular item: its children, plus a placeholder when it has no content. */
  private renderPlainItem(node: AstListItem): void {
    appendChildren(this.element, node.children);
    const paragraph = node.children.find((child) => child.type === 'paragraph');
    const emptyParagraph = paragraph?.type === 'paragraph' && paragraph.children.length === 0;
    if (paragraph && !emptyParagraph) {
      return;
    }
    const placeholder = this.placeholder(node, false);
    if (emptyParagraph) {
      this.element.querySelector('p')?.appendChild(placeholder);
    } else {
      // `- ` with nothing after the marker: the item is a bare line, which
      // still needs somewhere for the caret to sit and text to be typed.
      this.element.appendChild(placeholder);
    }
  }

  /** A task item: a checkbox followed by the item's content. */
  private renderTaskItem(node: AstListItem, checked: boolean, markerOnly: boolean): void {
    this.element.classList.add('list-none');
    const position = node.position?.start.offset;
    if (position !== undefined) {
      setOffset(this.element, TASK_SOURCE_FROM, position);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-task-row flex items-start';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.dataset.taskCheckbox = 'true';
    checkbox.className = 'markdown-task-checkbox shrink-0';
    wrapper.appendChild(checkbox);

    // The checkbox and the item's text sit in a row; the item's *other* block
    // children — a nested list above all — belong to the item itself, below
    // that row and at the item's content column. Markdown indents a nested
    // list to that column, so leaving the list inside the row would indent it
    // by a whole checkbox more than the source says.
    const content = document.createElement('div');
    content.className = 'min-w-0 flex-1';
    const blocks: HTMLElement[] = [];

    if (markerOnly) {
      // `- [ ] ` with nothing after the marker parses as a plain item whose
      // text is the marker itself; render it as an empty task item instead.
      const paragraph = document.createElement('p');
      paragraph.className = 'min-w-0 markdown-node my-0';
      paragraph.appendChild(this.placeholder(node, true));
      content.appendChild(paragraph);
    } else {
      for (const child of node.children) {
        const component = createComponent(child);
        if (!component) {
          continue;
        }
        if (child.type === 'paragraph') {
          component.element.classList.add('my-0');
          if (child.children.length === 0) {
            component.element.appendChild(this.placeholder(node, false));
          }
        }
        if (child.type === 'paragraph') {
          content.appendChild(component.element);
        } else {
          blocks.push(component.element);
        }
      }
    }
    wrapper.appendChild(content);
    this.element.append(wrapper, ...blocks);
  }

  /**
   * The caret/typing placeholder for an item without content. Its raw offset
   * is where the item's content would start: the paragraph's own start when
   * there is one, otherwise the end of the item's marker line. The node it
   * holds is *empty*: an item with nothing in it has no character of its own,
   * and the space that used to stand here was one the reader could select and
   * copy. The line's box comes from the item itself, and the caret reads it
   * through `caret/geometry.ts: lineBoxAround`.
   */
  private placeholder(node: AstListItem, markerOnly: boolean): HTMLElement {
    const span = document.createElement('span');
    span.className = 'markdown-list-placeholder markdown-node';
    span.appendChild(document.createTextNode(''));
    const offset = contentOffset(node, markerOnly);
    if (offset !== null) {
      setOffset(span, TEXT_FROM, offset);
    }
    return span;
  }
}

/** The checked state of an item whose only content is a bare task marker. */
function markerOnlyChecked(node: AstListItem): boolean | null {
  const paragraph = node.children.find((child) => child.type === 'paragraph');
  if (paragraph?.type !== 'paragraph' || paragraph.children.length !== 1) {
    return null;
  }
  const child = paragraph.children[0];
  if (child.type !== 'text') {
    return null;
  }
  const match = MARKER_ONLY.exec(String(child.value ?? ''));
  return match ? match[1].toLowerCase() === 'x' : null;
}

/**
 * Where the item's content starts in the block's raw slice. A task marker the
 * parser turned into plain text (`- [ ] `) is not content, so those items put
 * the caret at the end of their marker line instead.
 */
function contentOffset(node: AstListItem, markerOnly: boolean): number | null {
  if (!markerOnly) {
    const paragraph = node.children.find((child) => child.type === 'paragraph');
    const start = (
      paragraph as { position?: { start: { offset?: number } } } | undefined
    )?.position?.start.offset;
    if (start !== undefined) {
      return start;
    }
  }
  return node.position?.end.offset ?? null;
}
