# Code block cross-references

## Scope

This construct-specific specification builds on
`2026-10-24-cross-reference-targets-design.md` and follows the figure target
work in `2026-10-24-figure-cross-references-design.md`.

It adds:

- Pandoc-compatible attributes on fenced code blocks;
- optional captions for code listings;
- explicit IDs and automatic `[#lst:id]` references;
- visible sequential listing labels;
- source editing for the opening-fence attributes;
- command-click navigation to a listing;
- consistent anchors, labels, and captions in every export kind.

Tables, equations, and lists remain outside this specification.

## What is a listing

A fenced code block is a listing when its opening fence carries a Pandoc
attribute block with a non-empty `#id`, a non-empty `caption`, or both.

This is a captioned, targetable listing:

~~~markdown
```python {#lst:example caption="Example caption"}
print("hello")
```
~~~

This is a target without a caption:

~~~markdown
```python {#lst:example}
print("hello")
```
~~~

This is a caption-only code block:

~~~markdown
```python {caption="Example caption"}
print("hello")
```
~~~

A code block with neither an ID nor a caption remains an ordinary code block.

The ID decides reference identity. The caption does not create a target on its
own.

## Syntax

Both Pandoc spellings are supported:

~~~markdown
```python {#lst:example .numberLines startFrom=5 caption="Example caption"}
...
```
~~~

~~~markdown
```{#lst:example .python .numberLines startFrom=5 caption="Example caption"}
...
```
~~~

In the first form, the bare word before the attribute block names the language.
In the second, a `.language` class does. If both are present, they are combined
in source order using Pandoc's rule: the first class is the highlighting
language.

Rules:

- the attribute block must be on the opening fence;
- the ID is the target's document-wide identity;
- `caption` is the visible listing caption;
- every other class and key/value attribute is preserved for Pandoc;
- `caption=""` and a caption containing only whitespace count as no caption;
- malformed attributes remain ordinary fence text and create no target;
- an attribute block without an ID or caption does not make a listing;
- a closing fence is never parsed for listing attributes.

The caption is plain text, not Markdown. It may contain escaped spaces, quotes,
`#`, and `}` according to Pandoc's attribute grammar. The caption source remains
inside the opening fence.

There is no new frontmatter setting. Listing numbering is always ID-driven:

```text
ID + caption      -> Listing N, targetable
ID without caption -> Listing N, targetable
caption only      -> unnumbered caption, not targetable
neither           -> ordinary code block
```

## Parser model

A pure code-fence attribute parser owns the opening-fence grammar. The parser
and the block renderer both consume its answer; neither reimplements the
syntax.

The parsed shape is:

```ts
interface CodeFenceData {
  id: string | null;
  language: string | null;
  classes: string[];
  attributes: Record<string, string>;
  caption: string | null;
  attribute: PandocAttributeBlock | null;
}
```

The metadata transform replaces a qualifying mdast `code` node with a
block-level `listing` node that retains:

- the original code value;
- its source position;
- the complete opening-fence spelling;
- the parsed ID, language, classes, attributes, and caption.

Serialization returns the original fence source exactly. It must not normalize
the language position, quote style, class order, or attribute spelling.

The shared reference index adds a `listing` entry only for a code block with an
explicit ID. The entry's:

- `kind` is `listing`;
- `id` is the explicit ID;
- number is its one-based position among ID-bearing listings;
- title is the caption, or the empty string for an ID-only listing;
- source range covers the complete fenced block;
- primary caret position is the first body line, not the opening fence.

Caption-only and ordinary code blocks create no index entry.

## Rendering

### Rendered listing

While the caret is outside the block, a listing renders as:

```html
<figure class="markdown-listing" id="lst:example">
  <pre class="markdown-fenced-code">
    <code class="language-python">…</code>
  </pre>
  <figcaption class="markdown-listing-caption">
    <span class="markdown-listing-label">Listing 1.</span>
    Example caption
  </figcaption>
</figure>
```

The existing language button remains at the code box's top-right corner.

The visible caption area follows these cases:

- ID and caption: `Listing N.` followed by the caption;
- ID without caption: `Listing N.` only;
- caption without ID: the caption only;
- neither: no caption element.

The listing label is generated chrome and contributes no source offsets. The
caption text is presentation of the opening-fence attribute and is not an
editable second copy.

Only the explicit ID is applied to the editor DOM. Other classes and attributes
remain export metadata.

A listing block's render key participates in the shared reference version.
Inserting or removing an earlier listing therefore rebuilds this block even
though its own source did not change, so its visible label follows the shared
number.

### Line numbers

`.numberLines`, `.number-lines`, and `startFrom` remain Pandoc presentation
attributes. The Yi editor does not add a line-number gutter in this feature.
They remain visible in source mode and are passed to Pandoc-backed exports
unchanged.

The ordinary Pandoc default stylesheet renders Pandoc's HTML/EPUB line-number
markup when the writer receives `numberLines`. Processed Markdown does not
reproduce that Pandoc stylesheet or synthesize a line-number column.

## Source mode and caret behavior

While the caret is outside the fenced block, only the code body and generated
listing caption are visible. The opening fence, language, and attributes are
hidden by the existing fenced-source rule.

While the caret is inside any part of the block:

- the complete fenced source is shown, including both delimiter lines;
- the ID, caption, language, and other attributes are editable in place;
- the generated listing caption is not also drawn beside the source;
- caret offsets map through the author's characters exactly.

A plain click on the code enters the block's source at the character clicked,
following the existing fenced-block behavior. A click on the generated caption
enters the first body line.

One Left from the first attribute character exits the attribute block; the
separator space is not a separate caret stop.

## Numbering and references

Only ID-bearing listings consume numbers. They are numbered in document order
across the whole document:

```text
caption-only code block -> no listing number
code block {#lst:first} -> Listing 1
code block {#lst:second caption="Second"} -> Listing 2
ordinary code block -> no listing number
```

Inserting, removing, or reordering an ID-bearing listing recalculates every
later listing number and every automatic reference.

The existing automatic-reference syntax applies:

```markdown
See [#lst:first].
```

It renders and exports as:

```markdown
See [Listing 1](#lst:first).
```

A manual link keeps its author-written text:

```markdown
See [the parsing example](#lst:first).
```

Caption-only listings cannot be referenced because they have no ID. A duplicate
ID follows the shared first-match and duplicate-invalid behavior.

The listing label uses the shared automatic-reference label policy. This feature
does not define a document-language policy, add per-document label metadata, or
choose label wording independently of the shared reference layer.

## Navigation

Command-click or Ctrl-click on either a manual or automatic listing reference:

1. reveals the listing's block through the virtualized renderer;
2. enters source mode for the complete fenced block;
3. places the caret at the first character of the first body line;
4. keeps `location.hash` unchanged.

A missing listing keeps the shared unresolved-reference behavior.

The caret lands in code rather than in the opening fence so typing after a
navigation jump cannot accidentally alter the caption or ID.

## Export

All automatic references are rewritten before export:

```markdown
[Listing 1](#lst:example)
```

The original `[#lst:example]` source never reaches Pandoc.

### HTML, EPUB, DOCX, and ODT

These writers do not display Pandoc's code-block `caption` attribute as a
visible caption. Yi therefore preprocesses each listing into one identified
Pandoc Div containing the code and a visible caption paragraph.

For an identified listing:

~~~markdown
::: {#lst:example .listing}
```{.python .numberLines startFrom=5}
print("hello")
```
::: {.listing-caption}
Listing 1. Example caption
:::
:::
~~~

For an ID-only listing, the caption paragraph is:

```markdown
::: {.listing-caption}
Listing 1.
:::
```

For a caption-only code block, the outer wrapper has no ID:

~~~markdown
::: {.listing}
```{.python}
print("hello")
```
::: {.listing-caption}
Example caption
:::
:::
~~~

Rules:

- the ID moves from the code fence to the outer Div so no duplicate anchor is
  emitted;
- `#id` and `caption` are removed from the inner fence;
- language, classes, `numberLines`, `startFrom`, and all other attributes remain
  on the inner fence;
- Markdown punctuation in a caption is escaped so the caption remains literal;
- the visible label is generated from the shared document index;
- the outer Div carries the ID that becomes an HTML/EPUB target, DOCX bookmark,
  or ODT section;
- an ordinary unlabeled and uncaptioned fence is left unchanged.

The `.listing` and `.listing-caption` classes let HTML/EPUB templates and
reference DOCX/ODT packages style the output. The feature does not require a
particular template.

### Processed Markdown

Processed Markdown is presentation-oriented and must show both the target and
caption in common Markdown readers:

```html
<figure id="lst:example" class="listing">
  <pre><code class="language-python">print(&quot;hello&quot;)</code></pre>
  <figcaption>Listing 1. Example caption</figcaption>
</figure>
```

Rules:

- HTML-escape the entire code body and caption;
- preserve line endings inside the escaped code;
- apply the language as `class="language-…"`;
- omit `id` for a caption-only block;
- put no generated label on a caption-only block;
- put only `Listing N.` in the caption element for an ID-only block;
- omit the `<figure>` wrapper's ID when there is no ID;
- do not add a line-number column for `.numberLines`;
- put the language on the `<code>` element;
- put other classes on the `<figure>` element;
- map other key/value attributes to escaped `data-*` attributes, matching the
  figure fallback.

Re-importing this output treats it as raw HTML, not as a Yi listing.

Some Markdown readers sanitize raw HTML or remove IDs. Their content may still
display while fragments do not resolve; Yi cannot override the host renderer's
security policy.

### LaTeX and PDF

LaTeX/PDF keep Pandoc's native highlighting and listing behavior. Yi does not
add its generated caption paragraph there.

The user controls whether `listings` is used through `syntax-highlighting` in
the export defaults or template package. Yi does not force
`syntax-highlighting: idiomatic`.

The preprocessor does not read `syntax-highlighting` from the export defaults or
a template package. It rewrites the LaTeX/PDF source by listing shape only. The
same export source is produced for both highlighting modes; Pandoc decides how
much of that source is visible.

With idiomatic highlighting:

- ID plus caption passes through unchanged and becomes a native captioned
  `lstlisting` with a label and counter;
- ID without caption is given a private zero-width caption during export. Pandoc
  emits Unicode U+200B as `\hspace{0pt}`, which advances the native listing
  counter while showing the normal `Listing N` prefix and no visible caption
  text;
- caption without ID changes its export-only `caption` attribute to Pandoc's
  `title` attribute, which displays an unnumbered native listing title without
  advancing the counter. If the author already supplied `title`, the exported
  caption wins; the source keeps the author's `title` unchanged;
- an ordinary code block passes through unchanged.

The private zero-width caption is never added to the document text and is absent
from source mode. It exists only in the temporary export source.

With ordinary non-idiomatic LaTeX highlighting:

- Pandoc still receives the same export source;
- Pandoc ignores visual code captions/titles under that highlighting mode;
- an ID-bearing listing still receives a resolvable target where the LaTeX
  writer can preserve it;
- users who want visible native captions and listing counters should configure
  idiomatic highlighting.

This behavior is intentional: LaTeX/PDF honor the user's Pandoc configuration.
Yi supplies the target and the native-counter bridge only where an ID-only
listing would otherwise have no valid label.

### Export case matrix

| Source | HTML/EPUB/DOCX/ODT | Processed Markdown | LaTeX/PDF, idiomatic |
| --- | --- | --- | --- |
| `#id` + `caption` | `Listing N. caption` | `Listing N. caption` | Native `Listing N` and caption |
| `#id` only | `Listing N.` | `Listing N.` | Native counter advances; `Listing N` prefix, no caption text |
| `caption` only | Caption without label | Caption without label | Unnumbered native title |
| Neither | Ordinary code | Ordinary code | Ordinary code |

The reference index's number and the visible non-LaTeX label always agree. In
idiomatic LaTeX/PDF, the export bridge keeps Pandoc's native listing counter in
the same sequence.

## Errors and edge cases

- Repeated IDs resolve to the first matching listing.
- An ID with no caption is numberable and referencable.
- A caption with no ID is visible but unnumbered and unreferencable.
- Empty or whitespace-only captions behave as absent captions.
- Invalid attribute syntax creates no listing target.
- An unclosed fence remains an editable fenced block; its valid opening
  attributes still describe the listing.
- A caption containing Markdown syntax is displayed literally.
- `numberLines` numbers source lines; it never creates a listing number.
- Listing numbers are document-global and are unaffected by language or
  grouping.
- A missing target follows the shared unresolved-reference behavior.

## Tests

Node checks will cover:

- both supported opening-fence forms;
- bare language and language class normalization;
- ID, caption, classes, and key/value parsing;
- caption escaping and plain-text behavior;
- malformed opening fences;
- qualification of ordinary, caption-only, ID-only, and full listings;
- document-order numbering of ID-bearing listings only;
- reference labels and duplicate resolution;
- source serialization without normalization;
- non-LaTeX export wrappers for all four source cases;
- processed Markdown HTML escaping and target placement;
- LaTeX export for all four source cases, including the zero-width
  ID-only bridge and caption-to-title caption-only bridge.

Tauri probes will cover:

- an ID-bearing listing's rendered label and caption;
- an ID-only listing's label;
- a caption-only listing's unnumbered caption;
- an ordinary fence remaining unchanged;
- the opening fence staying hidden outside the block;
- all opening-fence text being visible and editable inside the block;
- one-step caret exit from the attribute block;
- command-click navigation to a virtualized listing;
- the caret landing on the first body line;
- live renumbering after inserting a listing above;
- automatic-reference text updates after renumbering;
- the default fixture's full listing example.

Export probes will cover:

- processed Markdown's HTML listing and reference links;
- HTML and EPUB targets and visible captions;
- DOCX bookmarks and visible captions;
- ODT named sections and visible captions;
- LaTeX labels, `\hyperref`, native captions, and mixed ID-only/captioned
  counter order;
- PDF output with idiomatic highlighting;
- unchanged output when a listing has neither ID nor caption;
- caption-only and ID-only cases in every export kind.

## Documentation and fixture

The user documentation will explain every case and consequence:

- both supported opening-fence spellings;
- the distinct roles of ID and caption;
- why an ID produces `Listing N`;
- why a caption without an ID is visible but unnumbered;
- how numbering changes when listings are inserted or reordered;
- manual links versus `[#lst:id]`;
- how to edit the opening-fence attributes;
- where command-click lands;
- how line numbering differs from listing numbering;
- how HTML, EPUB, DOCX, ODT, processed Markdown, LaTeX, and PDF display the
  result;
- why idiomatic LaTeX highlighting is needed for native visible listing
  captions and counters;
- what happens under ordinary LaTeX highlighting;
- that no frontmatter setting or extra LaTeX package is required by Yi itself.

`test/fixtures/workspace/default-document.md` will include:

- an ordinary code block;
- a caption-only code block before the numbered sequence;
- an ID-only listing;
- a captioned listing with classes and a key/value attribute;
- `.numberLines` with a nonzero `startFrom`;
- manual and automatic references to both identified listings.

## Out of scope

- cross-document listing references;
- plural references and ranges;
- automatic IDs for unlabeled listings;
- chapter-relative or configurable listing numbering;
- a frontmatter numbering-policy switch;
- rich Markdown captions inside the fence attribute;
- nested listings;
- source-line numbering in Yi's editor;
- a line-number column in processed Markdown HTML;
- forcing a LaTeX highlighting method or package.
