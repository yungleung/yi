/**
 * Renders a `table` node: the first row becomes `<thead>`, the rest `<tbody>`,
 * and every cell is named by its index (`data-table-cell="row:column"`).
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper
 * and the AST types. Upholds: the offsets a cell carries are block-relative
 * positions in its own block's text — computed nowhere here, because
 * `caret/offsets.ts` turns the cell's name into one when the caret needs it.
 */

import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstTable, AstTableCell } from '../ast';

export class Table extends EditableNodeComponent {
  private readonly tableNode: AstTable;

  constructor(node: AstTable) {
    super('table', node, document.createElement('table'), 'markdown-table');
    this.tableNode = node;

    const rows = node.children;
    if (rows.length === 0) {
      return;
    }

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const [column, cell] of rows[0].children.entries()) {
      const th = document.createElement('th');
      th.appendChild(this.renderCell(cell, 0, column));
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    this.element.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const [index, row] of rows.slice(1).entries()) {
      const tr = document.createElement('tr');
      for (const [column, cell] of row.children.entries()) {
        const td = document.createElement('td');
        td.appendChild(this.renderCell(cell, index + 1, column));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    this.element.appendChild(tbody);
  }

  private renderCell(cell: AstTableCell, row: number, column: number): HTMLElement {
    const content = document.createElement('div');
    content.className = 'markdown-table-cell';
    content.dataset.tableCell = `${row}:${column}`;
    // The row's own raw start: the mapper needs it to find this table when the
    // block holds more than one.
    const rowStart = (
      this.tableNode.children[row] as { position?: { start: { offset?: number } } } | undefined
    )?.position?.start.offset;
    if (rowStart !== undefined) {
      content.dataset.tableRowStart = String(rowStart);
    }
    if (cell.children.length === 0) {
      // An empty cell has no text to aim at: this span gives the caret something
      // to sit in, and the node it holds is *empty* — a space would be a
      // character the reader could select and copy that the document does not
      // hold. The cell's own line box is what the caret reads
      // (`caret/geometry.ts: lineBoxAround`); the offset comes from the source
      // model.
      const placeholder = document.createElement('span');
      placeholder.className = 'markdown-table-placeholder markdown-node';
      placeholder.appendChild(document.createTextNode(''));
      content.appendChild(placeholder);
    }
    appendChildren(content, cell.children);
    const align = this.tableNode.align?.[column] ?? null;
    if (align) {
      content.style.textAlign = align;
    }
    return content;
  }
}
