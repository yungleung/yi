import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstTable, AstTableCell } from '../ast';

/** Renders a `table` node: first row becomes `<thead>`, the rest `<tbody>`. */
export class Table extends EditableNodeComponent {
  constructor(node: AstTable) {
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

  private renderCell(cell: AstTableCell): HTMLElement {
    const content = document.createElement('div');
    appendChildren(content, cell.children);
    return content;
  }
}
