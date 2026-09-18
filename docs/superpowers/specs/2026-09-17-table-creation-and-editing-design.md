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
  cells for `Tab`. An offset that falls between cells resolves to the *nearest*
  one, so an offset just past the table's last cell belongs to that cell rather
  than to the cell at the other end of the table.

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

### 7. How a table is presented

The typography defaults a table to the full column width and draws one border
under each row, which reads as a list rather than a table. A table is typeset
like a figure instead:

- `width: auto` with centred margins, so the table takes the width its content
  needs and sits in the middle of the column;
- a visible border on every side of every header and body cell;
- a minimum width per cell (`3.5rem`), so an empty cell still has room for a
  caret and a few characters while a column with content grows past it.

Alignment stays per column (`text-align` from the delimiter row); the frame
around it is presentation, not content.

### 8. Moving through a table with Enter

`Enter` inside a cell goes **down the column**: the caret moves to the cell
under it, which is how a table is filled in. A cell with nothing under it — the
last row, or a short row that does not reach that column — ends the column
there, and the key does what `Enter` does at the end of any other block: it
starts an empty paragraph below the table and **puts the caret on it**, not
back inside the table.

That paragraph is placed by counting the newlines the table already has after
it and adding only the missing ones: between the table and a following block
one blank line is the separator and the next one is the paragraph, while at the
end of the document no separator is due. When an empty paragraph is already
there, `Enter` simply moves onto it rather than stacking another blank line.

`Shift+Enter` is the same key inside a table, because a cell holds text rather
than lines and a soft break has nothing to mean there; outside a table it keeps
its usual meaning.

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

## Appendix: the list tools

The titlebar carries a second group of buttons beside the table one — ordered,
bullet and task lists, and one indent step — because a table is a structure the
author inserts and edits, and so is a list. The rules live in
`list_edits.ts` (pure) and `editing/lists.ts` (the editor-facing commands), the
buttons in `ui/list_toolbar.ts`.

**The three list buttons toggle.** A line that is not a list item gets the
marker the button names; a line that is already that kind loses its marker and
becomes an ordinary line again; a line that is another kind is rewritten in
place. Content never moves, and an item's indentation is kept through a
rewrite. An ordered item continues the numbering of the ordered item directly
above it at the same indentation, and starts at 1 otherwise. On a selection the
same rule applies to every line it touches, in one edit, so a mixed selection
becomes one list of the named kind; a selection that stops where a line starts
does not touch that line, and a blank line is never given a marker.

**One indent step is the parent's content column**, not a fixed number of
spaces: markdown nests a child list only when it reaches the column the item
above starts its content in — two spaces under `- `, three under `1. `, four
under `10. ` — so the step is measured from that item and each subtree moves by
its own amount. The step applies to the item *and its subtree*, so a nested
list stays nested in the item it belongs to, and un-indenting moves the subtree
back to the parent's column. Only list items move: a plain paragraph is left
alone, because spaces at the start of a line mean an indented code block.

An ordered item that moves is **renumbered for the level it lands on**, because
a nested ordered list that does not begin at 1 is not read as a list at all —
markdown sees the text of the item above it. An item joining an existing nested
run takes the next number; an item opening one starts at 1.

**`Tab` and `Shift+Tab` are the same commands** as the indent button, so a list
can be shaped without leaving the keyboard. Inside a table cell the table's own
rule comes first — Tab walks the cells — and elsewhere Tab keeps whatever the
browser did with it before. Each command is one `applyEdit`, so a list change
is one undo step, and the caret travels with the text it sat in.

## Appendix: Tab inside a fenced code block

**One Tab is two spaces**, because a code block cannot hold a literal tab that
the author can see or line up, and two spaces is what markdown code in this
project already uses. `code_edits.ts` holds the rule; `editing/code.ts` applies
it and only ever fires when the caret is inside a `fencedCode` block.

- a caret gets two spaces at its position, and is left after them;
- a selection indents **every line it touches** and never eats the selected
  text — Tab over a block of code is an indent, not a replacement;
- `Shift+Tab` takes one step back off each line it touches, and does nothing
  when there is nothing to take (but still keeps the key inside the editor);
- the **fence lines are never touched**. Two spaces in front of a closing fence
  is a fence that no longer closes, so ``` and ~~~ lines are left out of every
  line edit;
- a blank line inside a selected range stays empty rather than collecting
  trailing spaces.

## Appendix: footnotes

**A reference is only a reference when its definition is in the same parse.**
Markdown reads `[^1]` as a footnote reference only if the document defines
`[^1]: …`, and this editor parses one block at a time — so a marker in a
paragraph and its definition further down used to leave the marker as plain
text, which is why it never rendered as a superscript.

The state now hands each non-raw block the definitions its references need
(`withFootnoteDefinitions`), appended as plain text *after* the block's own
text so every real position is unchanged, and drops the nodes those borrowed
lines parse into (`isOwnContent`). A raw block — code, math, html — is left
alone: its brackets are text.

**The button writes both halves in one edit**: `[^N]` where the caret is, and
an empty `[^N]: ` line at the end of the document. `N` is one past the highest
numbered label in the document, so labelled footnotes (`[^note]`) never collide
with it. One edit means one undo takes the whole footnote away, and the caret
stays just after the new marker, where the author was writing.

**The notes are one part of the document, not a set of blocks.** The *first*
definition is set off from what precedes it by a blank line; every definition
after it follows the note above it directly, on the next line. So a document
grows like this:

```markdown
Body text.[^1][^2]

[^1]: First note.
[^2]: Second note.
```

The button decides between the two by looking at the document's last run of
non-blank lines: if a definition starts one of them, the notes are already open
and the new one joins them.

Markdown does not require that blank line — footnotes are not in the GFM
specification at all. GitHub announced them in 2021 without specifying them, as
`micromark-extension-gfm-footnote` (what `remark-gfm` parses with) says in as
many words, and its grammar only notes that a blank line is *allowed* inside a
definition. Checked against the parser, a definition directly under a paragraph
parses exactly like one after a blank line. The blank line is there for the
document's sake: a definition is a container, so an unindented line typed under
it is swallowed into the note as a lazy continuation. Separated, the notes are
a part of the document of their own, and nothing typed below them can join one.
Newlines the document already ends with are left alone, because an empty
paragraph is a block here rather than mere separation.

A footnote marker also counts as its rendered width (`[label]`) in the offset
model. Counted as nothing, the caret placed just after a marker mapped back in
front of it, and the next marker typed landed on the wrong side of the one
before.

**Notes are set tight, the way they are set in print**: one paragraph skip
between definitions rather than a block's own leading. A definition carries no
top margin of its own, and its bottom margin is the paragraph skip, so a note
follows the note above it by the same 8px a paragraph follows a paragraph by.

**A marker and its definition jump to each other.** The marker renders as a
superscript link carrying `data-footnote-ref`; the definition's label carries
`data-footnote-def`. The editor catches the click before a node can place a
caret where the pointer happened to land: the marker sends the caret to the
start of the definition's text, ready to be written, and the definition's label
sends it just past the marker it belongs to. The target's block is revealed
first, because the definition is usually below the viewport.

Known limit: a block's cached parse is keyed by its own text, but whether a
reference parses depends on the document's definitions. Removing a definition
therefore leaves a dangling marker looking like a footnote until its own block
re-renders; clicking it then does nothing.
