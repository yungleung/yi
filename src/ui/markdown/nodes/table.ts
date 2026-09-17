import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstTable, AstTableCell } from '../ast';

/**
 * Renders a `table` node: the first row becomes `<thead>`, the rest `<tbody>`.
 *
 * Each cell is named by its index (`data-table-cell="row:column"`) and carries
 * the block-relative offset its row starts at. The offsets themselves are not
 * computed here: `position.ts` turns a cell name into an offset from the
 * block's own text, which is where a caret in a cell has to land. The header
 * is row 0 and the body rows follow, exactly the numbering the delimiter
 * line's absence leaves mdast with.
 */
export class Table extends EditableNodeComponent {
  private readonly tableNode: AstTable;

  constructor(node: AstTable) {
    super('table', node, document.createElement('table'), 'w-full');
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
      // An empty cell has no text to aim at: this span gives it a line box and
      // the caret something to sit in. Its offset comes from the source model.
      const placeholder = document.createElement('span');
      placeholder.className = 'markdown-table-placeholder markdown-node';
      placeholder.textContent = '\u00a0';
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
