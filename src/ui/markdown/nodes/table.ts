import { appendChildren } from './create_node';
import {
  EditableNodeComponent,
  type MarkdownTable,
  type MarkdownTableCell
} from './editable_node';

/** Renders a `table` node: first row becomes `<thead>`, the rest `<tbody>`. */
export class Table extends EditableNodeComponent {
  constructor(node: MarkdownTable) {
    super('table', node, document.createElement('table'), 'w-full');

    const rows = node.children;
    if (rows.length === 0) {
      return;
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const cell of rows[0].children) {
      const th = document.createElement('th');
      th.appendChild(this.renderCell(cell));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    this.element.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows.slice(1)) {
      const tr = document.createElement('tr');
      for (const cell of row.children) {
        const td = document.createElement('td');
        td.appendChild(this.renderCell(cell));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    this.element.appendChild(tbody);
  }

  private renderCell(cell: MarkdownTableCell): HTMLElement {
    const content = document.createElement('div');
    appendChildren(content, cell.children);
    return content;
  }
}
