# Cross-reference targets and automatic references

## Problem

Yi can reference ATX and setext headings with ordinary Markdown links. The
advanced-markdown work now needs the same navigation and reference behavior for
figures, code blocks, tables, equations, and lists.

These target kinds share four needs:

- a stable identifier on a source construct;
- a document-wide index from identifiers to source positions and display
  numbers;
- command-click navigation that works across virtualized blocks;
- export behavior that remains consistent across Markdown, HTML, EPUB, DOCX,
  ODT, LaTeX, and PDF.

Their source syntax differs, and Pandoc does not preserve all native object IDs
in every writer. This specification defines the shared target and reference
layer. Each element gets a separate feature specification for its source
syntax, rendering, editing, and export details.

## Link forms

The two cross-reference forms are:

```markdown
[the model figure](#fig:model)
[#fig:model]
```

The first remains an ordinary Markdown link with author-written text.

The second is Yi's automatic reference. Yi infers the visible text from the
target's kind and number:

```text
[#fig:model] -> Figure 1
[#tbl:data]  -> Table 2
[#lst:parse] -> Listing 1
[#eq:energy] -> Equation (3)
[#list:steps] -> List 1
```

The inferred text is then represented as an ordinary link in every export:

```markdown
[Figure 1](#fig:model)
```

For LaTeX and PDF, that becomes:

```latex
\hyperref[fig:model]{Figure 1}
```

Yi does not emit `\autoref` or `\cref`. Resolving the visible text in Yi keeps
the reference wording consistent across formats and avoids requiring a
`cleveref` package in user templates.

Automatic references are same-document references only. Cross-document targets,
plural references, and reference ranges are out of scope.

## Automatic-reference syntax

`[#id]` is an inline Yi Markdown node.

Rules:

- the ID must be non-empty;
- it is recognized only outside code, fenced blocks, and literal regions;
- an escaped `\[#id]` remains literal text;
- plain click reveals the reference source for editing;
- ⌘-click and Ctrl-click navigate to the target;
- an unresolved reference renders the literal ID with an unresolved style and
  does not navigate;
- in processed Markdown, an unresolved reference becomes `[#id](#id)`;
- `[#]` is ordinary text, not a reference.

The completed reference node is rendered as a link, but its source remains
`[#id]`. While the caret is inside it, the editor shows that source exactly.

## Target model

One document-level index owns every reference target and every unlabeled object
that consumes a number:

```ts
type ReferenceKind = 'heading' | 'figure' | 'listing' | 'table' | 'equation' | 'list';

interface ReferenceEntry {
  /** Null for a numbered object that has no explicit reference target. */
  id: string | null;
  kind: ReferenceKind;
  /** Source range used for navigation and target editing. */
  from: number;
  to: number;
  /** Sequential number among numberable targets of this kind, or null. */
  number: number | null;
  /** The visible title/caption used for diagnostics and manual lookup. */
  title: string;
  /** The document-owned kind word used by an automatic reference. */
  label: string;
  /** Literal text placed before a numbered kind's sequential number. */
  numberPrefix: string;
  /** Where navigation places the caret; null uses `from`. */
  caretAt: number | null;
  /** Whether the ID came from the author rather than automatic heading rules. */
  explicit: boolean;
}
```

The index:

- scans targets in document order;
- is cached by document text;
- is invalidated by every edit;
- returns the first target for a duplicate ID;
- retains duplicate-target information so the editor can mark all duplicates;
- includes targets outside the mounted viewport;
- owns numbering and auto-reference text, not individual renderers.

The existing heading index becomes one source for this generic index. Heading
targets remain automatic where Pandoc generates their IDs.

All non-heading objects require an explicit ID to be referencable. A figure,
table, or captioned list may still consume a number without an ID; such an entry
cannot be the destination of a cross-reference.

## Numbering

Number eligibility follows the object's semantic role rather than merely whether
it has an ID:

- every implicit Pandoc figure consumes a figure number, labeled or not;
- every captioned table consumes a table number, labeled or not;
- a code block consumes a listing number only when explicitly marked as a
  target;
- an equation consumes an equation number only when explicitly marked as a
  target;
- every captioned list consumes a list number, labeled or not.

This matches Pandoc's LaTeX behavior for captioned figures and tables while
avoiding turning every demonstration fence, exploratory formula, or uncaptioned
list into a numbered object.

Pandoc's non-LaTeX writers do not add numbers to captioned figures or tables.
Yi therefore displays the shared computed number in its editor and in exported
HTML, EPUB, DOCX, and ODT captions. LaTeX/PDF uses native float counters where
the object has one. Lists use a Yi-owned object counter through LaTeX's native
reference mechanisms because no native counter covers a whole list. The
numbering policy must keep every writer's sequence aligned with the shared
index.

Numbers are document-global in the first release:

- figures: `Figure 1`, `Figure 2`;
- tables: `Table 1`, `Table 2`;
- code blocks: `Listing 1`, `Listing 2`;
- equations: `Equation (1)`, `Equation (2)`;
- lists: `List 1`, `List 2`.

Inserting or removing a numbered object recalculates every later number and
every automatic reference. A block containing an automatic reference must
re-render when its resolved text changes, even when that block's own source did
not.

The first release uses one document-global sequence per kind.
`reference-labels` and `reference-number-prefixes` in frontmatter may replace
the default English kind word and add literal prefix text. Yi does not infer a
chapter-relative prefix from heading structure. A LaTeX/PDF template may instead
configure its object counter's reset level and format.

Headings do not gain synthetic section numbers in this release. An automatic
reference to a heading displays the heading's title, matching its existing link
semantics.

Default kind words are English. Document frontmatter is the authority for a
custom label or literal number prefix.

## Source syntax by target kind

The shared layer defines the ID and reference contracts. Each feature
specification owns the exact editing behavior for its construct.

| Kind | Intended Pandoc-compatible source | Notes |
| --- | --- | --- |
| Heading | `## Title {#id}` | Existing behavior; automatic IDs remain supported |
| Figure | `![Caption](path){#fig:id}` | ID is on the image; Pandoc produces a `Figure` with that ID |
| Code block | ` ```{#lst:id .python} ` | ID is on the opening fence; language remains a class |
| Table | Pipe table followed by `: Caption {#tbl:id}` | The caption carries the table ID |
| Equation | `[$$ … $$]{#eq:id}` | The span identifies the complete math block |
| List | List followed by `: Caption {#list:id}` | Uses the table caption-line grammar; Pandoc has no native list caption |

Table and list caption lines share one colon-line grammar. The preceding block
decides the owner: a table line attaches only after a table, and a list line
attaches only after a list at the same base indentation. After any other block,
the line keeps Pandoc's ordinary paragraph or definition-list meaning.

Lists do not use source fenced `Div` syntax. That keeps list targets independent
of callouts and other future fenced-div containers.

Each feature specification must still define:

- how the attribute source is hidden while the caret is outside the target;
- how the caret enters and edits that source;
- how the target's visible number or caption is drawn;
- which malformed forms remain ordinary Markdown;
- how the source maps back to document offsets.

For equations, one math block is one target regardless of how many aligned lines
it contains. Per-row equation references are out of scope.

## Navigation

Command-click on either link form resolves through the shared target index:

1. decode the fragment;
2. find the first target with that ID;
3. reveal its block through the virtualized renderer;
4. place the caret at the target's primary editable position;
5. keep `location.hash` unchanged.

If no target exists, an automatic reference shows the unresolved style and a
localized message. The document does not move.

## Export

All export kinds receive the same resolved reference text. The automatic
reference source is never leaked to Pandoc.

### Portable link rewrite

The export preprocessor rewrites `[#id]` to an ordinary fragment link:

```markdown
[Figure 1](#fig:id)
```

For LaTeX/PDF, the LaTeX writer then emits `\hyperref` with the same text.

### Target anchors

Pandoc preserves native IDs on figures, code blocks, and tables in HTML, EPUB,
DOCX, and LaTeX. Its ODT writer drops those object IDs. Fenced `Div` IDs survive
in ODT as named sections.

Therefore each element exporter must provide one normalized block target:

- HTML/EPUB: an ID-bearing element surrounding the native figure, code, table,
  equation, or list;
- DOCX: an ID-bearing wrapper that becomes a Word bookmark;
- ODT: an ID-bearing `Div` that becomes a document section;
- LaTeX/PDF: a label at the target's correct semantic position;
- equation targets: a numbered `equation` environment so the equation counter
  and label describe the same object;
- Markdown: native Pandoc-compatible source forms are preserved where possible.

An element exporter must not emit duplicate IDs when both the native object and
its wrapper could create anchors.

### Targets in visible output

In rendered exports, the target must visibly carry the same number used by
automatic references:

- figure, table, and captioned-list captions gain their configured kind word
  and number, with English defaults;
- code blocks show their configured label, with an English default;
- equations show the number in their display layout;
- LaTeX/PDF may use native float/counter numbering, but its numbering sequence
  must match the shared index.

Each element specification owns the placement and styling of that label.

For captioned lists, HTML, EPUB, DOCX, and ODT use one identical normalized
wrapper/caption representation. The writer maps that wrapper to an HTML
container, Word bookmark, or ODT named section, but label, prefix, sequence,
caption placement, and target semantics do not vary by kind.

Processed Markdown uses presentation-oriented fallbacks where an element
specification needs one for common Markdown readers. Pandoc-backed exports keep
native semantic source so their target-specific numbering and conversion
continue to work.

## Error handling

- Unknown ID: unresolved reference, localized message, no navigation.
- Duplicate ID: first target resolves; every duplicate is marked invalid.
- Target without a supported ID syntax: not indexed or numbered.
- Invalid attributes: remain ordinary source text.
- Missing number: automatic reference falls back to the target title.
- Export with an unresolved reference: writes `[#id](#id)`.

## Testing

Shared checks will cover:

- parsing `[#id]`, escaping, empty IDs, and literal regions;
- target indexing and document-order numbering;
- duplicate IDs and first-match resolution;
- automatic-reference text from document labels and literal prefixes;
- reference-text invalidation and re-rendering after edits;
- export rewriting to ordinary links;
- unresolved-reference fallback.

Shared Tauri probes will cover:

- rendering automatic references as normal links;
- source mode and exact caret placement in `[#id]`;
- command-click across a virtualized document;
- live numbering updates after inserting or reordering targets;
- processed Markdown export.

Each element specification adds its own parser, caret, rendering, export, and
fixture probes.

## Delivery order

The work is split into independently reviewable feature branches:

1. shared target index, `[#id]` parsing/rendering, numbering, and navigation;
2. figures;
3. code blocks;
4. tables;
5. equations;
6. lists.

This order establishes the common layer once, then takes the simplest
attribute-bearing block before the kinds that need caption or wrapper work.

## Out of scope

- cross-document references;
- plural references and ranges;
- per-row equation references;
- chapter-relative or configurable numbering;
- automatic IDs for unlabeled non-heading targets;
- inserting a package dependency such as `cleveref`;
- changing user-supplied LaTeX inside a math block.
