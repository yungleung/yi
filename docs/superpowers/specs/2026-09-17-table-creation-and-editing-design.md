# Table creation and table editing

## Problem

The editor renders GFM tables but offers no way to work with them:

- there is no way to create a table from the UI — the author has to type every
  pipe by hand;
- an empty cell is dead. It renders as an empty `div` with no placeholder, so
  it has no line box, a click cannot land a caret in it, and `Delete` there
  removes the character before the caret — the `|` or the last character of the
  neighbouring cell;
- `table.align` is parsed by remark-gfm and then ignored: every column renders
  left-aligned whatever the delimiter row says;
- inserting, deleting or moving a row or column means editing the source by
  hand, which is exactly the work a WYSIWYG editor is supposed to remove.

## Design

### 1. A table source model

New module `src/ui/markdown/table_source.ts`, the single place that understands
what a table's raw slice *is*. No DOM, no editor imports — it is pure text.

```ts
/** A cell's raw content span, block-relative, excluding the pipes. */
interface TableCellSpan {
  row: number;
  column: number;
  contentStart: number;
  contentEnd: number;
}

interface TableLine {
  /** Block-relative span of the line, excluding its newline. */
  start: number;
  end: number;
  kind: 'header' | 'delimiter' | 'body';
  cells: TableCellSpan[];
}

interface TableSource {
  lines: TableLine[];
  /** Column count from the delimiter row. */
  columns: number;
  align: Array<'left' | 'center' | 'right' | null>;
}

function readTableSource(text: string): TableSource;
function locateCell(source: TableSource, offset: number): TableCellSpan | null;
function cellValue(text: string, span: TableCellSpan): string;
```

Rules, all chosen to agree with remark-gfm (verified by parsing probe: a cell
boundary is any unescaped `|`, *including one inside inline code*, and rows are
**not** padded to the header's column count):

- the row separator is an unescaped `|`; `\|` is content;
- outer pipes are optional (`a | b` is a two-cell table);
- rows may be ragged; a column index beyond a row's own cells does not exist in
  that row;
- the delimiter row is the line matching `^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$`;
  its cells carry the alignment (`:---`, `:---:`, `---:` or `---`) and give the
  table's column count;
- a **line an operation touches is rewritten in canonical form**
  (`| a | b |`, an empty cell as `|  |`), and the delimiter row is rewritten
  keeping each column's alignment. Lines the operation does not touch keep
  their original spacing byte for byte, so an edit never reflows a table the
  author formatted by hand beyond the line it had to change.

### 2. Cells render as editable lines

`src/ui/markdown/nodes/table.ts` and `src/ui/markdown/position.ts`.

The renderer needs no new plumbing, and no node reaches back into the editor.
The table's own raw text is already where the mapping code can see it: the
caret and selection mappers look a block up in the state, and a block carries
its `text` and `charStart`. So the split between the two sides of a cell is:

- the **component** names a cell by its index, which mdast alone provides
  (mdast drops the delimiter row, so AST row *j* is source row *j* for the
  header and *j + 1* below it);
- the **mapper** turns that name into a block-relative offset with the source
  model, from the block's own text.

Each cell therefore renders:

- the parsed mdast children, as today;
- `data-table-cell="row:column"` on the cell element, so a right-click can name
  what it hit without re-parsing;
- for an empty cell, a `markdown-table-placeholder` span, exactly like
  `markdown-list-placeholder` does for an empty list item. The placeholder is
  what gives the cell a line box and the caret somewhere to live; it carries no
  offset of its own.

`position.ts` handles the placeholder in both directions:

- `documentOffsetAt` — a caret anywhere inside a table placeholder resolves
  through `table_source.ts` to that cell's content start in the block's text,
  so typing lands in that cell and nowhere else;
- `domPositionAtOffset` — a raw offset inside a table block resolves to the cell
  that contains it: the caret goes into that cell's text at the matching
  position, or into its placeholder when the cell is empty. This is what puts
  the caret in the first header cell after creation and what moves it across
  cells for `Tab`.

Alignment is finally rendered: `table.align[column]` sets `text-align` on the
header and body cells of that column.

### 3. Creating a table

Two new UI modules plus one command:

- `src/ui/table/table_toolbar.ts` — the titlebar-centre button (same
  `BaseComponent` + inline-SVG pattern as `formatting_toolbar.ts`); it opens and
  closes the picker and emits a `TABLE_INSERT` event with `{rows, columns}`,
  mirroring how `FORMATTING_COMMAND` reaches the editor.
- `src/ui/table/table_picker.ts` — the 10 × 10 grid. Hovering cell *(r, c)*
  highlights the whole `r × c` region and labels it; clicking picks it; Esc, a
  click outside or a second click on the button closes the panel without
  inserting. The panel is positioned under the button and must not start a
  titlebar drag (the toolbar buttons already do exactly this).
- `src/ui/markdown/editing/table.ts` — `insertTable(context, {rows, columns})`.

Semantics:

- the picked size counts the header row: `3 × 4` is 3 columns and 4 rows total,
  written as a header line, a delimiter line, then 3 body lines of empty cells;
- every cell starts empty (`|  |`), and the caret lands in the first header
  cell, which is the first placeholder;
- where the table goes: if the caret's line is an empty paragraph, that line
  becomes the table; otherwise the block splits at the caret and the table is
  inserted as a block of its own between the halves, with the blank-line
  separators markdown needs to keep it from merging into the surrounding
  paragraphs (the same arithmetic `editing/blank_lines.ts` already uses);
- the whole insertion is one `applyEdit`, so it is one undo step, and the
  scroll position is kept.

### 4. The native context menu

`src/ui/table/table_menu.ts` builds the menu; every `@tauri-apps/api/menu` call
lives there, so the editor and its commands never import Tauri.

Right-clicking inside a cell (a `contextmenu` listener on the editor content,
`preventDefault`ed so the webview's own menu does not stack under ours):

1. resolves the cell element (`td`/`th` with `data-table-cell`) to `{block,
   row, column}`, and captures that **target**;
2. pops the menu up with `Menu.popup(LogicalPosition(clientX, clientY))` — the
   window's webview spans the whole window (`titleBarStyle: Overlay`), so
   client coordinates are window coordinates;
3. each item's action dispatches a command with the *captured* target, never
   with the live caret: a native menu can move focus and the caret with it.

Menu shape, grouped by what it manipulates:

- **Row** ▸ insert row above · insert row below · delete row · clear row ·
  move row up · move row down
- **Column** ▸ insert column left · insert column right · delete column ·
  clear column · move column left · move column right · align column ▸ left ·
  center · right
- clear cell
- delete table · clear table

Items that cannot apply are created disabled (`enabled: false`) rather than
hidden: deleting or moving the **header** row (GFM needs a header and a
delimiter to be a table at all), deleting the last remaining column, moving a
row/column at the edge, clearing a cell that is already empty, and clearing a
table that has no content. A disabled item keeps the menu's shape stable, so
the row/column groups are always in the same place.

### 5. The commands

`src/ui/markdown/editing/table.ts` — one function per menu item, each a single
`applyEdit` over a block-relative range (absolute = `block.charStart` +
relative), so undo/redo, block re-render and scroll-keeping all come from the
existing machinery:

| Command | Raw edit |
| --- | --- |
| insert row above / below | insert a canonical empty row line at the header/body boundary the index implies |
| delete row | remove the row's line and its newline; refuse the header row |
| clear row | blank every cell on the row's line, keeping the line |
| move row up / down | swap the row's line with its neighbour |
| insert column left / right | insert an empty cell into **every** line (delimiter included) at that index; short rows are padded by the canonical rewrite |
| delete column | remove the cell at that index from every line; refuse the last column |
| clear column | blank the cell at that index on every line |
| clear cell | blank the cell that was right-clicked, keeping the line |
| move column left / right | swap the cell at that index with its neighbour on every line, so the column's alignment moves with it |
| align column | rewrite that column's delimiter cell as `:---`, `:---:` or `---:` |
| clear table | blank every cell, keeping the frame and the alignment |
| delete table | remove all of the table's lines; the caret goes to the nearest remaining text (`state.nearestTextOffset`), or to offset 0 when the table was the whole document |

### 6. Keys inside a cell

- `Delete` / `Backspace` in an empty cell: nothing happens, the caret stays —
  the reported bug, fixed by a guard in `editing/text_commands.ts` that
  recognises a caret in a table placeholder before the character-delete path;
- `Enter` in a cell: nothing happens. A table row cannot hold a line break, and
  splitting the line would silently shred the table;
- `Tab` / `Shift+Tab`: move the caret to the next / previous cell of the table
  (row-major); `Tab` in the last cell appends a body row and moves into its
  first cell. The caret is placed at the cell's content start.

## Testing

Driven through the Tauri MCP bridge, both in the default document's `## Tables`
section and in a table created from scratch:

- picker: hover highlights the right region, click inserts `rows` lines total
  with `columns` cells each, Esc and outside-click insert nothing;
- insertion into an empty paragraph line versus mid-paragraph, checked against
  the raw text (Select All + copy) and against `validateBlocks()`;
- the caret in the first header cell after creation, and in the cell that was
  clicked after a click;
- `Delete` in an empty cell leaves the raw text unchanged and the caret in the
  cell; `Delete` in a cell with content still deletes one character;
- every menu command: raw text before/after, cell contents, and undo/redo
  restoring the exact original text;
- `Tab` traversal across a row boundary, `Shift+Tab` back, and the new row from
  `Tab` in the last cell;
- alignment: the delimiter row written as expected and the rendered cells
  carrying the matching `text-align`;
- the general regression probes (`check-blocks.mjs`, `check-enter.mjs`,
  `regression-*.js`) to prove block offsets stayed in sync and unrelated
  editing is untouched.

Two assumptions are verified live before the design is trusted: that the macOS
webview's own context menu does not appear alongside the Tauri one, and that
`popup` lands the menu on the cell that was right-clicked.

## Out of scope

Cell-level alignment (markdown has no syntax for it), multi-line cells, column
widths and author padding preservation in touched lines, drag handles for
resizing or reordering, and converting an existing block into a table.
