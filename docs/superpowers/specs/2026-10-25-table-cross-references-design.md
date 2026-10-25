# Table cross-references

## Scope

This construct-specific specification builds on
`2026-10-24-cross-reference-targets-design.md` and follows the figure and
code-block target work.

It adds:

- captions and Pandoc attributes to existing GFM pipe tables;
- explicit IDs and automatic `[#tbl:id]` references;
- visible sequential table numbers;
- source editing for a table's caption and attributes;
- command-click navigation to a table;
- consistent targets, captions, and numbering in every export kind;
- a contract for template-package Lua filters that rewrite tables.

It also fixes the existing table-caret boundary bug: a caret after the final
table row must never be redirected into the nearest table cell.

The table editor already exists. Its creation, cell editing, context menu,
alignment, row and column operations, and keyboard traversal are not redesigned
here.

Margin placement is owned by LaTeX/PDF template packages. Yi recognizes and
preserves the `.margin` class but does not place the table in a margin itself
and does not ship a Lua filter for that purpose.

Equations and lists remain outside this specification.

This specification amends one shared export rule for tables: automatic
LaTeX/PDF references resolve through the package's native table counter instead
of carrying Yi's precomputed number as link text.

## What is a captioned table

The supported source is a GFM pipe table followed by a Pandoc caption line:

```markdown
| A | B |
| --- | --- |
| 1 | 2 |
: Data from the first run {#tbl:data}
```

Pandoc accepts no blank line or one blank line between the table and its
caption. Yi accepts both and treats the table and caption as one editor block.

The logical source has up to three parts:

```text
pipe-table lines
optional source-only blank separator
caption line
```

The caption is not edited through a table cell, and the optional separator is
not an artifact of the table's last cell. The separator is source syntax, not a
rendered empty-line element.

A table is captioned when its caption line has either:

- non-empty caption text; or
- a non-empty trailing `#id`.

These are valid captioned tables:

```markdown
: Unlabelled but numbered

: {#tbl:target}

: Results {#tbl:results .margin data-owner=demo}
```

An ordinary table has no following caption line. It has no table number and no
reference target.

The forward `Table: Caption` Pandoc form is outside this release. It remains
ordinary Markdown unless a later import feature recognizes it.

## Syntax

The canonical form is:

```markdown
| A | B |
| --- | --- |
| 1 | 2 |
: Caption text {#tbl:id .class key=value}
```

Rules:

- the table itself remains a GFM pipe table;
- the caption line begins with `:` followed by separation whitespace;
- the caption is inline Markdown, not plain text;
- the trailing Pandoc attribute block must be separated from the caption text
  by whitespace;
- `#id` is the table's document-wide reference identity;
- classes and key/value attributes are preserved for Pandoc and template
  filters;
- only the ID is applied to Yi's editor DOM;
- the attribute source belongs to the caption line and is not part of the
  visible caption;
- attributes that do not parse as a final Pandoc block remain caption text and
  create no target;
- an empty caption with no ID is not a captioned table;
- a closing caption line with only attributes and an ID is an ID-only table;
- the source spelling of the table, caption, and attributes is preserved
  exactly.

The `.margin` class has no placement meaning in Yi. It remains in the export
attributes so a template package's Lua filter or stylesheet may implement its
own margin behavior.

## Parser model

The caption parser and the Pandoc attribute parser are pure syntax modules.
The parser pipeline combines the table's mdast node with the following caption
node and exposes one block-level table rendering.

The added data is:

```ts
interface TableReferenceData {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: RootContent[];
  captionSource: {
    from: number;
    to: number;
    textFrom: number;
    textTo: number;
  };
  attribute: PandocAttributeBlock | null;
}
```

The source ranges are block-relative. `captionSource` covers the complete
`: …` line. `textFrom` and `textTo` cover the inline caption between the colon
and the trailing attribute block.

The node retains the original table rows, alignments, cell contents, and source
positions. Serialization returns the exact source; it does not normalize pipe
spacing, caption whitespace, or attribute order.

The block grouping includes at most one blank line between the table and
caption. Two or more blank lines leave the caption as ordinary following source.
An edit that changes that separation re-splits the block without changing the
caret's document offset.

A caption with no parsable attributes has `id = null` and an empty attribute
list. A valid attribute block without an ID still retains its classes and
key/value attributes.

## Rendering

A captioned table renders as:

```html
<div class="markdown-table-block" id="tbl:data">
  <table class="markdown-table">…</table>
  <div class="markdown-table-blank" aria-hidden="true"></div>
  <div class="markdown-table-caption" role="caption">
    <span class="markdown-table-label">Table 1.</span>
    Data from the first run
  </div>
</div>
```

The caption is displayed below the table, following its source position. Export
writers remain free to place native captions according to their own templates.

The table wrapper:

- receives only the explicit ID from the attributes;
- keeps the existing table alignment, cell borders, minimum cell widths, and
  horizontal overflow behavior;
- participates in the shared reference version, so inserting or removing an
  earlier numbered table redraws its generated label;
- keeps failed or unsupported classes out of its editor classes.

The caption area follows these cases:

- caption and ID: `Table N.` followed by the rendered caption;
- caption without ID: `Table N.` followed by the rendered caption;
- ID without caption: `Table N.` only;
- no caption line: no caption area and no number.

The generated label contributes no document offsets. The caption's inline
children map back to the caption source.

The caption is not a second editable copy of the source. A plain click on it
reveals the caption line as source, where the caption and attributes can be
edited.

The source separator is not rendered. It contributes no visible line box and no
DOM node, so the table and caption have the same spacing whether their source is
joined directly or separated by one blank line.

## Source mode and caret behavior

Table cells keep their existing WYSIWYG editing behavior. Entering a cell does
not replace the table with its raw source.

The optional separator is retained in the source and in block grouping but has
no editor DOM node. A caret in the caption maps through the caption source, never
through a cell.

The table-cell mapper is bounded by the table's own source. An offset at the end
of the last row may resolve to that row's final cell; every offset on the next
line must fall through to the separator or caption mapper. "Nearest cell"
selection is allowed only among cells whose line spans contain or touch the
offset, never for arbitrary text following the table.

The caption line has its own revealable source:

- while the caret is elsewhere, the rendered caption is shown and the
  `{#id .class key=value}` source is hidden;
- clicking a character in the rendered caption reveals the complete
  `: Caption {…}` line and places the caret at the corresponding source
  character;
- while that source is open, the caption text, ID, classes, and key/value
  attributes are editable in place;
- leaving the caption source restores the rendered caption and hides the
  attributes;
- one Left from the first character of the trailing attribute block exits the
  attribute source;
- the separating space before the attribute block is not a separate caret stop.

Both caption forms are editable:

- a caption directly after the table is reached by clicking the rendered
  caption;
- a caption after one source separator is reached by the same rendered caption;
- at the start of the revealed caption source, `Backspace` removes the source
  separator and joins the caption directly to the table;
- at the same position, `Enter` adds one source separator while keeping the
  caption recognized.

`Enter` in the last table cell keeps its existing behavior: it creates an empty
line after the table and puts the caret there. Each subsequent keystroke remains
on that line. It does not re-enter the final cell, and a second blank line ends
the caption association instead of creating an ambiguous caption.

The table's ID applies whether the caption source is open or closed. The caption
label remains generated chrome and never becomes a document offset.

## Numbering and references

Every captioned table consumes one table number in document order, whether or
not it has an ID:

```text
ordinary table                         -> no number
caption-only table                     -> Table 1
table with {#tbl:data}                 -> Table 2
ID-only table                          -> Table 3
```

The shared reference index adds an entry for every number-consuming table. Only
tables with an ID can be navigation targets.

The entry's:

- `kind` is `table`;
- `id` is the explicit ID or null;
- number is the one-based position among captioned tables;
- title is the caption's plain-text form, or the empty string;
- source range covers the complete table and caption line;
- primary caret position is the first character of the first header cell, or
  that cell's placeholder when empty.

Inserting, removing, or reordering a captioned table recalculates every later
table number and every automatic reference.

The automatic reference:

```markdown
See [#tbl:data].
```

resolves through the shared index. A manual link keeps its author-written text:

```markdown
See [the measured values](#tbl:data).
```

The label comes from `reference-labels.table`. Its default and fallback is
`Table`. The number comes after `reference-number-prefixes.table`; the default
and fallback prefix is empty. Yi does not derive the prefix from a chapter or
section.

Duplicate IDs follow the shared first-match rule. A table without an ID is
numbered but cannot be a reference target.

## Navigation

Command-click or Ctrl-click on either reference reveals the table's block,
leaves `location.hash` unchanged, and places the caret in the first header cell.

An empty header cell uses its existing placeholder. This makes navigation land
where typing would begin without selecting the caption or exposing attribute
source.

A missing target follows the shared unresolved-reference behavior.

## Export

Table placement and package selection remain the template's responsibility. Yi
only guarantees the semantic table, caption, ID, and shared number.

### HTML and EPUB

Pandoc receives the native captioned table with its attributes. The caption
text is prefixed with the computed label:

```markdown
: Table 2. Data from the first run {#tbl:data .margin data-owner=demo}
```

Rules:

- add the visible label to caption-only, ID-only, and captioned tables;
- leave an ordinary uncaptioned table unchanged;
- keep the table ID, classes, and key/value attributes for Pandoc;
- omit an ID for caption-only tables;
- preserve caption inline Markdown;
- `.margin` is only a class; Yi does not add margin CSS or page geometry.

HTML and EPUB therefore use Pandoc's native `<table>`, `<caption>`, and ID.

### DOCX and ODT

Pandoc does not preserve table object IDs in these writers. Yi therefore wraps
an identified table in a Pandoc `Div` carrying the ID and moves the ID off the
caption:

```markdown
::: {#tbl:data .table-target}
| A | B |
| --- | --- |
| 1 | 2 |
: Table 2. Data from the first run {.margin data-owner=demo}
:::
```

The wrapper becomes a Word bookmark or ODT named section. Caption-only tables
stay unwrapped and unnumbered IDs; ordinary tables remain unchanged.

Classes and key/value attributes remain on the table caption for Pandoc and
reference-document styling. The `.margin` class does not create a side margin
in Word or OpenDocument; it is available only to a user-provided filter that
implements one.

### LaTeX and PDF

The native Pandoc source keeps the caption attributes and an unmodified caption
text:

```markdown
: Data from the first run {#tbl:data .margin data-owner=demo}
```

Pandoc's default LaTeX writer emits:

```latex
\caption{Data from the first run}\label{tbl:data}
```

Every captioned table follows one shared `table` counter. An ID-only table
remains a normal empty native caption, so it advances the counter and receives
its label.

Package Lua filters may replace `longtable` with a class-specific table
environment, including a margin-table environment selected by `.margin`.
Nothing in Yi depends on `longtable` being retained.

The filter contract is:

- preserve `tbl.attr.identifier` as `\label{…}` after the caption;
- preserve the caption through normal `\caption{…}`;
- keep the identified table tied to the shared LaTeX `table` counter;
- do not hard-code `Table N`;
- do not use `\caption*` for a numbered table;
- preserve classes and key/value attributes for package-specific placement.

Yi ships no margin-table filter and defines no separate margin-table sequence.
Package filters and templates own margin placement.

### Automatic LaTeX/PDF references

For an automatic reference to a table, LaTeX/PDF use a header macro rather than
Yi's computed number:

```markdown
\yiTableRef{tbl:data}
```

The generated header defines the portable meaning:

```latex
\providecommand{\yiTableRef}[1]{%
  \hyperref[#1]{\tablename~\ref*{#1}}%
}
```

The final number therefore comes from the selected template, class, or filter.
Chapter-based numbering, custom `\thetable` definitions, and literal prefixes
all resolve through the same `\ref`.

Manual links remain ordinary Markdown links and become
`\hyperref[tbl:data]{author text}`.

Automatic references to non-table targets retain the existing resolved-link
behavior. An unresolved table reference keeps the shared fallback.

### Processed Markdown

Processed Markdown uses HTML so common Markdown readers show both the caption
and the target:

```html
<table id="tbl:data" class="margin">
  <caption>Table 2. Data from the first run</caption>
  <thead>…</thead>
  <tbody>…</tbody>
</table>
```

Rules:

- render the table's header and body cells as escaped HTML;
- render inline Markdown inside cells and captions as HTML;
- apply column alignment to each rendered cell;
- write the shared computed label into the caption;
- omit `id` for caption-only tables;
- map classes to the HTML `class` attribute;
- map key/value attributes to escaped `data-*` attributes;
- keep `.margin` only as a class; no default margin stylesheet is emitted;
- rewrite `[#tbl:id]` to an ordinary `[Table N](#tbl:id)` link.

Re-importing this file treats it as raw HTML, not as a Yi table.

### Export matrix

The matrix assumes an empty prefix and default label.

| Source | HTML/EPUB | DOCX/ODT | Processed Markdown | LaTeX/PDF |
| --- | --- | --- | --- | --- |
| No caption | Ordinary table | Ordinary table | Ordinary table | Ordinary table |
| Caption only | Native table, `Table N.` in caption | Native table, visible caption | HTML table, visible caption | Native numbered caption |
| ID only | Native table ID, `Table N.` caption | Wrapped bookmark/section, visible label | HTML table ID, visible label | Empty captioned table with label |
| ID and caption | Native ID and numbered caption | Wrapped target and numbered caption | HTML ID and numbered caption | Native caption and label |

Configured labels and prefixes replace every visible `Table N` spelling. The
LaTeX/PDF number remains the package counter's value.

## Errors and edge cases

- A table with no following caption line is not numbered.
- An empty line after the table belongs to that line, not to the last table
  cell.
- A colon line with no caption and no ID remains ordinary source text.
- Two or more blank lines prevent a following `: …` line from attaching as a
  table caption.
- Malformed trailing attributes remain visible caption text and create no ID.
- A caption-only table is numbered but not referencable.
- An ID-only table is numbered and referencable.
- Duplicate IDs resolve to the first table and are marked invalid.
- Empty header cells keep their editable placeholder as a navigation target.
- A missing ID does not create an HTML `id`, DOCX bookmark, ODT section, or
  LaTeX label.
- A template filter that discards the table ID breaks references; Yi's header
  cannot recover discarded source metadata.
- A template that defines a separate margin-table counter must map it back to
  the shared table counter; Yi does not create that counter.
- Margin placement is template-specific and may not be available in every
  output kind.

## Tests

Pure checks will cover:

- caption-line recognition with zero or one separating blank line;
- caption-only, ID-only, and captioned-table qualification;
- inline Markdown caption parsing;
- trailing ID, class, and key/value attributes;
- malformed attributes and exact source serialization;
- document-order numbering of all captioned tables;
- `reference-labels.table` and `reference-number-prefixes.table`;
- duplicate IDs and first-match resolution;
- non-LaTeX caption rewriting;
- DOCX/ODT target wrappers;
- processed Markdown HTML rendering and escaping;
- LaTeX table source for every caption/ID combination;
- generated `\yiTableRef` header source.

Tauri probes will cover:

- rendered caption and number below a table;
- caption-only, ID-only, and captioned-table cases;
- caption source editing and hidden attributes outside it;
- one-step caret exit from the attribute block;
- typing on a blank line after a table stays on that line and changes only that
  line's source;
- typing a valid caption after the table creates the caption association;
- clicking and editing captions with both no separator and one blank separator;
- table-cell editing remaining unchanged;
- command-click navigation to the first header cell across virtualization;
- live renumbering and automatic-reference updates;
- duplicate and missing targets;
- the default fixture's table examples.

Export probes will cover:

- HTML/EPUB native table IDs and visible numbered captions;
- DOCX bookmarks and visible captions;
- ODT named sections and visible captions;
- processed Markdown HTML;
- LaTeX labels and `\yiTableRef`;
- a PDF whose template changes `\thetable`, proving the reference follows the
  package counter;
- a template-package table filter that preserves caption and label;
- `.margin` class preservation without Yi-owned placement.

## Documentation and fixture

The user documentation will explain:

- the post-table caption syntax and optional separating blank line;
- caption-only, ID-only, and captioned-table behavior;
- why every captioned table consumes a number;
- how to configure the label and literal number prefix;
- manual links versus automatic `[#tbl:id]` references;
- how to edit the caption and attributes;
- where command-click lands;
- how each export kind displays the table;
- why margin placement belongs to LaTeX/PDF template packages;
- why margin tables share the ordinary table sequence;
- the rule that a rewriting Lua filter must preserve the caption and ID.

`test/fixtures/workspace/default-document.md` will include:

- a caption-only table before the numbered targets;
- an ID-only table;
- a captioned table with `.margin` and another attribute;
- a `reference-labels.table` override;
- a literal `reference-number-prefixes.table` value;
- manual and automatic references.

## Out of scope

- margin-table placement or a Yi-owned margin-table Lua filter;
- a separate margin-table counter or reference sequence;
- captions before the table using Pandoc's `Table:` form;
- grid, simple, and multiline Pandoc tables;
- cross-document table references;
- plural references and ranges;
- automatic IDs for unlabeled tables;
- dynamic chapter numbering inferred by Yi;
- applying arbitrary table classes in the editor DOM;
- adding margin styles to HTML, DOCX, or ODT without a user template.
