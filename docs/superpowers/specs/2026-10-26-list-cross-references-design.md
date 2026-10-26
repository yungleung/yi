# List cross-references

## Scope

This specification builds on
`2026-10-24-cross-reference-targets-design.md` and follows the heading,
figure, code-listing, table, and equation work.

It adds:

- a caption-line syntax for top-level bullet, ordered, and task lists;
- explicit IDs and automatic `[#list:id]` references;
- visible document-ordered list numbers;
- command-click navigation to the first editable item;
- consistent targets, captions, and numbering in every export kind;
- a LaTeX/PDF object counter that does not reuse item counters owned by
  `enumerate`, `enumitem`, or another package.

The table and list caption lines intentionally share one syntax. Lists do not
use a source fenced `Div`, so their target syntax cannot be confused with
callouts or other future `:::` containers.

Changing item markers, list nesting, list continuation, checkbox behavior, and
the existing list toolbar commands is outside this specification.

## What counts as a captioned list

The supported source is one complete Markdown list that is a top-level block of
its container, followed by a caption line:

```markdown
1. Prepare the sample
2. Run the measurement

: Steps {#list:steps}
```

Yi's table caption rule accepts no blank line or one blank line between a table
and its caption. Lists use the same two separations between the final list line
and caption, and Yi treats the list and caption as one editor block.

The logical source has up to three parts:

```text
list lines
optional source-only blank separator
caption line
```

Supported list forms are the existing:

- bullet lists;
- ordered lists, including starts other than 1;
- task lists;
- a top-level unordered list containing both ordinary and task items.

The document root and a supported callout container may own a captioned list.
A list nested inside another list item is not a separate list target in this
release; it remains part of that item.

A list is captioned when its caption line has either:

- non-empty caption text; or
- a non-empty trailing `#id`.

These are valid captioned lists:

```markdown
: Unlabelled but numbered

: {#list:steps}

: Steps {#list:steps .wide data-owner=demo}
```

An ordinary list has no following caption line. It has no list number and no
reference target.

## Syntax

The canonical form is:

```markdown
1. First step
2. Second step
: Steps {#list:steps .class key=value}
```

Rules:

- the list remains ordinary Markdown;
- the caption line begins with `:` followed by separation whitespace;
- it begins at the list's own base indentation;
- the caption is inline Markdown, not plain text;
- the trailing Pandoc attribute block must be separated from the caption text
  by whitespace;
- `#id` is the list's document-wide reference identity;
- classes and key/value attributes are preserved for export and template
  styling;
- only the ID is applied to Yi's editor DOM;
- the attribute source belongs to the caption line and is not part of the
  visible caption;
- attributes that do not parse as a final Pandoc block remain caption text and
  create no target;
- an empty caption with no ID is not a captioned list;
- a caption line with only attributes and an ID is an ID-only list;
- the source spelling of the list, caption, and attributes is preserved
  exactly.

There is no required `.list-target` class in the source. `.list-target` is
generated only in the export representation that needs a target wrapper.

## Caption disambiguation

The colon line belongs to the list only when all of these hold:

1. the preceding block is a complete Markdown list;
2. the colon is at that list's base indentation;
3. no more than one blank line separates the list and the colon;
4. the line is otherwise a valid Yi caption line.

This keeps the existing meaning of a colon line after a paragraph, where Pandoc
reads it as a definition list:

```markdown
Term

: Definition
```

A colon line indented inside a list item also remains part of that item and may
still form a definition list:

```markdown
1. Term

   : Definition
```

Two or more blank lines end list-caption association. The colon line is then an
ordinary following block. A colon line with neither caption text nor an ID is
ordinary source.

A blank line followed by another list item or indented item continuation is
inside a loose list. Only a colon line after the complete final list content can
become its caption.

A source callout remains a fenced `Div`:

```markdown
::: {.callout-note}
1. First step
2. Second step

: Steps {#list:steps}
:::
```

The list caption is parsed inside the callout container and creates no fenced
`Div` in the source. When callout export support exists, its prepared
representation must provide a nesting level for Yi's generated list wrapper;
that change belongs to export text, never to the note's callout source.

## Parser model

The colon-line grammar and Pandoc attribute parsing should be shared with table
captions. A focused caption-line syntax module owns:

- colon and separation recognition;
- inline caption range;
- trailing Pandoc attribute block;
- source spelling and offsets.

The table feature adds table-specific attachment and rendering. The list
feature adds list-specific attachment and rendering. Neither reimplements the
caption grammar.

The added list data is:

```ts
interface ListReferenceData {
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

The list retains its mdast list node, ordered start, task-item state, nested
children, and source positions. Serialization returns the exact source; it does
not normalize markers, indentation, caption whitespace, or attribute order.

The block grouping includes at most one blank line between the list and caption.
An edit that changes that separation re-splits the block without changing the
caret's document offset.

A caption with no parsable attributes has `id = null` and an empty attribute
list. A valid attribute block without an ID still retains its classes and
key/value attributes.

## Rendering

A captioned list renders as:

```html
<div class="markdown-list-block" id="list:steps">
  <ol>…</ol>
  <div class="markdown-list-blank" aria-hidden="true"></div>
  <div class="markdown-list-caption" role="caption">
    <span class="markdown-list-label">List 1.</span>
    Steps
  </div>
</div>
```

The caption is displayed below the list, following its source position.

The list wrapper:

- receives only the explicit ID from the attributes;
- keeps the existing list markers, indentation, task checkboxes, editing, and
  keyboard behavior;
- participates in the shared reference version, so inserting or removing an
  earlier numbered list redraws its generated label;
- keeps unsupported classes out of its editor classes.

The caption area follows these cases:

- caption and ID: `List N.` followed by the rendered caption;
- caption without ID: `List N.` followed by the rendered caption;
- ID without caption: `List N.` only;
- no caption line: no caption area and no number.

The generated label contributes no document offsets. The caption's inline
children map back to the caption source.

The caption is not a second editable copy of the source. A plain click on it
reveals the caption line as source, where the caption and attributes can be
edited.

The optional source separator is not rendered. It contributes no visible line
box and no DOM node, so the list and caption have the same spacing whether their
source is joined directly or separated by one blank line.

## Source mode and caret behavior

List items keep their existing WYSIWYG editing behavior. Entering an item does
not replace the list with its raw source.

The optional separator is retained in the source and in block grouping but has
no editor DOM node. A caret in the caption maps through the caption source,
never through a list item.

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

- a caption directly after the list is reached by clicking the rendered
  caption;
- a caption after one source separator is reached by the same rendered caption;
- at the start of the revealed caption source, `Backspace` removes the source
  separator and joins the caption directly to the list;
- at the same position, `Enter` adds one source separator while keeping the
  caption recognized.

`Enter` in a list item keeps its existing list behavior. A second blank line
after the completed list ends caption association instead of creating an
ambiguous attachment.

## Numbering and references

Every captioned list consumes one list number in document order, whether or not
it has an ID:

```text
ordinary list                          -> no number
caption-only list                      -> List 1
list with {#list:steps}                -> List 2
ID-only list                           -> List 3
```

This is the same numbering strategy as captioned tables. A list number is the
number of the list object; it is independent of the item markers inside the
list.

The shared reference index adds an entry for every number-consuming list. Only
lists with an ID can be navigation targets.

The entry's:

- `kind` is `list`;
- `id` is the explicit ID or null;
- number is the one-based position among captioned lists;
- title is the caption's plain-text form, or the empty string;
- source range covers the complete list and caption line;
- primary caret position is the start of the first item's editable content.

Inserting, removing, or reordering a captioned list recalculates every later
list number and every automatic reference.

The automatic reference:

```markdown
See [#list:steps].
```

resolves through the shared index. A manual link keeps its author-written text:

```markdown
See [the measurement steps](#list:steps).
```

The label comes from `reference-labels.list`. Its default and fallback is
`List`. The number comes after `reference-number-prefixes.list`; the default and
fallback prefix is empty. Yi does not derive the prefix from a chapter or
section.

Duplicate IDs follow the shared first-match rule. A list without an ID is
numbered but cannot be a reference target.

## Navigation

Command-click or Ctrl-click on either reference reveals the list's block,
leaves `location.hash` unchanged, and places the caret at the first editable
item content.

An empty first item uses its existing list placeholder. For a task item, the
caret begins after the checkbox and before the first text character. An empty
list with no item placeholder uses the list block start.

A missing target follows the shared unresolved-reference behavior.

## Export

### Shared rules

For every writer:

- an ordinary list is not numbered;
- a captioned list is one numbered object;
- one Yi-owned list number is shared by the list caption and its automatic
  references;
- HTML, EPUB, DOCX, and ODT share one non-LaTeX representation: one target
  wrapper, one list, and one generated caption in source order;
- item markers and item numbers are unchanged;
- automatic references become ordinary links or native LaTeX references;
- source caption attributes survive in a target wrapper or caption structure;
- no source fenced `Div` is introduced;
- an unresolved automatic reference uses the shared link fallback.

The visible list caption uses:

```text
List N. Caption
```

or `List N.` when the caption text is empty. Configured labels and prefixes
replace `List` and `N` respectively.

### HTML, EPUB, DOCX, and ODT

All four non-LaTeX writers receive the same rewritten structure around the exact
list and its generated caption:

```markdown
::: {#list:steps .list-target .wide data-owner=demo}
1. First step
2. Second step

**List 2.** Steps
:::
```

Rules:

- the ID is on the wrapper, not on an individual list item;
- the source attributes are preserved on the wrapper;
- the caption appears after the list;
- caption inline Markdown remains Markdown for Pandoc to render;
- the ordered list's own start remains unchanged;
- task checkboxes remain ordinary GFM task-list syntax;
- caption-only lists use no ID;
- ordinary lists remain unchanged.

Pandoc therefore produces one stable target around the list and the visible
generated caption in every non-LaTeX writer. Pandoc emits an HTML `Div`, a Word
bookmark, or an ODT named section from the same wrapper. The caption is a normal
visible paragraph after the list in all four outputs. A caption-only list is
numbered without a wrapper ID. Classes and key/value attributes remain on the
wrapper for stylesheets, reference-document styles, and user filters.

### LaTeX and PDF

LaTeX has no global document counter for a whole list object. Reusing `enumi`,
`enumii`, or a package-owned item counter would make a cross-reference depend on
the first item's nesting and break for bullet and task lists.

Yi therefore owns one namespaced object counter, `yilist`. It does not reuse or
redefine native list counters.

The generated header defines:

```latex
\makeatletter
\@ifundefined{c@yilist}{\newcounter{yilist}}{}
\makeatother
\providecommand{\yiListNumber}{\arabic{yilist}}
\renewcommand{\theyilist}{\yiListNumber}
\providecommand{\yiListName}{List}
\providecommand{\yiListCounterSetup}{}
\providecommand{\yiListRef}[1]{%
  \hyperref[#1]{\yiListName~\ref*{#1}}%
}
```

The header applies the note's configured label and literal prefix inside
`\AtBeginDocument`:

```latex
\AtBeginDocument{%
  \yiListCounterSetup
  \renewcommand{\yiListName}{Steps}%
  \renewcommand{\theyilist}{\mbox{2-}\yiListNumber}%
}
```

The prefix is escaped as literal text. If the prefix is empty,
`\theyilist` keeps `\yiListNumber`.

#### Template counter setup

The counter has a Yi-owned name because LaTeX has no native counter for a whole
list object, but all of its reference behavior uses native LaTeX mechanisms:
`\refstepcounter`, `\label`, `\ref`, and `hyperref`. It never changes `enumi`,
`enumii`, `table`, or another package-owned counter.

The generated header calls `\yiListCounterSetup` once at
`\begin{document}`, before it applies the note's configured label and literal
prefix. A template can provide the hook and choose the reset level and number
format. For chapter-based list numbering:

```latex
\makeatletter
\providecommand{\yiListCounterSetup}{}
\renewcommand{\yiListCounterSetup}{%
  \@addtoreset{yilist}{chapter}%
  \renewcommand{\yiListNumber}{\thechapter.\arabic{yilist}}%
}
\makeatother
```

The default is one document-global sequence. A template may instead mirror its
own table counter's reset level and formatting by configuring both counters in
the same place. Yi cannot infer an arbitrary class's table reset or number
format, so table-identical behavior is a template contract rather than an
automatic consequence.

For a captioned list, the lowered LaTeX source:

1. increments `yilist`;
2. creates a hyperlink destination appropriate to the caption location;
3. records `\label{list:id}` when an ID exists;
4. renders the caption using `\yiListName` and `\theyilist`;
5. leaves the Markdown list itself for Pandoc's normal LaTeX list writer.

Only the counter, destination, label, and generated number are raw LaTeX. The
caption text remains Markdown so Pandoc can preserve its inline formatting.

The reference target is the generated caption location. Automatic references
use:

```latex
\yiListRef{list:steps}
```

The final number comes from the template-expanded `\theyilist`. A package may
redefine `\theyilist` to change the list-object sequence without changing the
reference label or Yi's source.

The `.list-target` class is an export marker only. Its exact raw LaTeX lowering
must not leak into HTML, EPUB, DOCX, ODT, or Processed Markdown.

### Processed Markdown

Processed Markdown uses HTML so common Markdown readers show the target,
list, caption, and generated number:

```html
<div id="list:steps" class="list-target wide" data-owner="demo">
  <ol>
    <li>First step</li>
    <li>Second step</li>
  </ol>
  <div class="list-caption">
    <span class="list-label">List 2.</span>
    Steps
  </div>
</div>
```

Rules:

- render ordered lists as `<ol>`, preserving a non-default start;
- render bullet lists as `<ul>`;
- render task items as disabled checkboxes plus their item content;
- render caption inline Markdown as HTML;
- write the shared computed label and prefix into the caption;
- omit `id` for caption-only lists;
- map classes to the HTML `class` attribute;
- map key/value attributes to escaped `data-*` attributes;
- rewrite `[#list:id]` to an ordinary `[List N](#list:id)` link.

Re-importing this file treats it as raw HTML, not as a Yi captioned list.

### Export matrix

The matrix assumes an empty prefix and default label.

| Source | HTML/EPUB/DOCX/ODT | Processed Markdown | LaTeX/PDF |
| --- | --- | --- | --- |
| No caption | Ordinary list | Ordinary list | Ordinary list |
| Caption only | Numbered list with visible caption | HTML list with visible caption | Visible numbered caption, no `\label` |
| ID only | Wrapped target and visible `List N.` | HTML target and visible label | Numbered caption and label |
| ID and caption | Wrapped target with numbered caption | HTML target with numbered caption | Numbered caption and label |

Configured labels and prefixes replace every visible `List N` spelling.

## Errors and edge cases

- A list with no following caption line is not numbered.
- A colon line with no caption and no ID remains ordinary source text.
- Two or more blank lines prevent a following `: …` line from attaching as a
  list caption.
- An indented colon inside a list item remains item content.
- A colon after a non-list paragraph keeps Pandoc definition-list behavior and
  is not a list caption.
- Malformed trailing attributes remain visible caption text and create no ID.
- A caption-only list is numbered but not referencable.
- An ID-only list is numbered and referencable.
- Duplicate IDs resolve to the first list and are marked invalid.
- Nested lists are content, not independent list targets.
- An empty first item keeps its editable placeholder as the navigation target.
- An empty list with no item placeholder navigates to the list block start.
- Missing IDs create no HTML ID, DOCX bookmark, ODT section, or LaTeX label.
- A callout may contain a captioned list; callout parsing and list-caption
  parsing remain independent.
- A package that redefines `\theyilist` changes the object number; it must not
  expect Yi to use `enumi` or per-item numbering.

## Tests

Pure checks will cover:

- caption-line recognition with zero or one separating blank line;
- caption-only, ID-only, and captioned-list qualification;
- rejection after paragraphs, inside list items, and after two blank lines;
- inline Markdown caption parsing;
- trailing ID, class, and key/value attributes;
- malformed attributes and exact source serialization;
- ordered, bullet, and task lists retaining their list model;
- document-order numbering of all captioned lists;
- `reference-labels.list` and `reference-number-prefixes.list`;
- duplicate IDs and first-match resolution;
- non-LaTeX caption rewriting and target wrappers;
- processed Markdown HTML rendering and escaping;
- LaTeX raw caption lowering and `\yiListRef`;
- generated `yilist` header source and prefix escaping.

Tauri probes will cover:

- rendered caption and number below a list;
- caption-only, ID-only, and captioned-list cases;
- caption source editing and hidden attributes outside it;
- one-step caret exit from the attribute block;
- caption association with and without one source separator;
- Backspace and Enter at the start of the revealed caption;
- unchanged item typing, task checkboxes, and nested-list behavior;
- command-click navigation to the first item across virtualization;
- empty first-item navigation;
- live renumbering and automatic-reference updates;
- duplicate and missing targets;
- a callout containing a captioned list;
- the default fixture's list examples.

Export probes will cover:

- one normalized HTML/EPUB/DOCX/ODT caption, sequence, and attribute contract;
- HTML/EPUB list targets and visible numbered captions;
- DOCX bookmarks and visible captions;
- ODT named sections and visible captions;
- Processed Markdown HTML;
- LaTeX `yilist` source and `\yiListRef`;
- a PDF whose template redefines `\theyilist`, proving the reference follows
  the template counter;
- caption-only lists advancing the sequence without creating a target.

## Documentation and fixture

The English Documentation will explain:

- the post-list caption syntax and optional separating blank line;
- caption-only, ID-only, and captioned-list behavior;
- why every captioned list consumes an object number;
- the difference between a list-object number and item numbers;
- how to configure the label and literal number prefix;
- manual links versus automatic `[#list:id]` references;
- how to edit the caption and attributes;
- where command-click lands;
- how each export kind displays the list;
- that callouts use fenced Divs while list captions do not;
- template `\theyilist` behavior in LaTeX/PDF;
- `\yiListCounterSetup` for chapter-based numbering.

`test/fixtures/workspace/default-document.md` will include:

- a caption-only bullet list;
- an ID-only ordered list;
- a captioned task list with a class and another attribute;
- a non-default ordered start;
- nested lists inside items;
- manual and automatic references;
- configured list label and prefix.

## Out of scope

- captions before the list;
- individual list-item targets;
- nested-list targets;
- changing item marker numbering to the object number;
- list-object captions in Pandoc's native syntax;
- a source fenced `Div` for list targets;
- callout/admonition syntax implementation;
- cross-document list references;
- plural references and ranges;
- automatic IDs for unlabeled lists;
- dynamic chapter numbering inferred by Yi;
- applying arbitrary list classes in the editor DOM.
