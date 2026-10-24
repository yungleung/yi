# Figure cross-references

## Scope

This is the first construct-specific specification built on
`2026-10-24-cross-reference-targets-design.md`.

It adds:

- explicit IDs for figures;
- visible sequential figure numbers;
- automatic references such as `[#fig:model]`;
- source editing for figure attributes;
- command-click navigation to a figure;
- cross-format export anchors and numbering.

Code blocks, tables, equations, and lists remain outside this specification.

## What is a figure

Yi follows Pandoc's implicit-figure rule:

- the image is alone in its paragraph;
- its alt text is non-empty;
- the paragraph contains no other visible content;
- optional Pandoc attributes may follow the image.

Thus this is a figure with target `fig:model`:

```markdown
![Model overview](images/model.png){#fig:model}
```

This is an inline image, not a figure:

```markdown
The [model is shown here ![overview](images/model.png).](#section)
```

An empty-alt standalone image is also not a figure under Pandoc's rule.

## Syntax

Supported source:

```markdown
![Caption](path){#fig:id .class width=80% key=value}
```

Rules:

- the image must be the paragraph's only visible content;
- the attribute block immediately follows the image destination;
- the identifier is optional;
- `#id` is the target's document-wide identity;
- classes and key/value attributes are preserved for Pandoc export;
- only the identifier is applied to Yi's figure DOM;
- malformed attributes remain ordinary source text;
- an inline image followed by an attribute block is not a reference target.

Every implicit figure receives a visible number, whether or not it has an ID.
Only figures with an ID can be reference destinations.

## Parser model

The parser creates a `figure` block-level node from a standalone attributed
image. Its data contains:

```ts
interface FigureData {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attributeRange: { from: number; to: number } | null;
}
```

The image remains the figure's child node, preserving:

- its alt text;
- destination;
- title;
- image resolution through the existing render context;
- existing click-to-edit image behavior.

The parser removes the attribute source from visible paragraph text while
retaining its exact range for source editing and serialization.

An image without a trailing attribute block is still a figure when it meets
Pandoc's implicit-figure rule.

## Rendering

A figure renders as:

```html
<figure id="fig:model">
  <img … />
  <figcaption>
    <span>Figure 1.</span>
    Caption text
  </figcaption>
</figure>
```

The figure element:

- receives only the explicit ID;
- keeps the existing image maximum-width behavior;
- renders its caption from the image alt text;
- displays the localized, document-computed number even when it has no ID;
- has a stable layout while the image loads;
- keeps an existing failed-image fallback path.

The caption's number is generated chrome and contributes no document offsets.
The caption text maps back to the image's alt source.

Classes and other attributes are not applied to the editor DOM in this release.
They remain visible in source mode and exercise their Pandoc behavior on export.

## Source mode and caret behavior

A plain click on the image continues to open the image's Markdown source.

When the caret is inside the figure's source:

- the image source remains editable as it is today;
- the trailing figure attribute block becomes visible after the image source;
- the caret maps exactly through both the alt text and attribute source;
- leaving the figure hides the attributes and restores the rendered figure.

The attribute source starts at `{`; its separating whitespace is not part of the
caret-editable source. One Left from the first attribute character exits the
attribute block.

Pandoc accepts image attributes without requiring whitespace, so both forms are
valid:

```markdown
![Caption](path){#fig:id}
![Caption](path) {#fig:id}
```

The parser preserves the spelling used by the author.

## Numbering and references

Every figure that satisfies the implicit-figure rule consumes one number in
document order:

```text
unlabeled figure       -> Figure 1
figure with fig:model  -> Figure 2
inline image           -> no number
```

The shared target index records the number and target position. An automatic
reference:

```markdown
[#fig:model]
```

renders as:

```markdown
[Figure 2](#fig:model)
```

The number is recalculated after insertion, removal, or reordering. Every
automatic reference updates when the figure sequence changes.

An unlabeled figure participates in numbering but cannot be referenced.

## Navigation

Command-click or Ctrl-click on either:

```markdown
[the model](#fig:model)
[#fig:model]
```

reveals the figure's block, focuses its source position, and leaves
`location.hash` unchanged.

A missing target keeps the current behavior from the shared specification.

## Export

### Processed Markdown

- preserve the native image and attributes;
- rewrite `[#fig:id]` to `[Figure N](#fig:id)`;
- prepend the computed figure number to captions so the output is numbered
  without another conversion step.

### Pandoc-backed exports

The export preprocessor creates one target wrapper and removes the same ID from
the image so no duplicate anchor is emitted:

```markdown
::: {#fig:model}
![Model overview](images/model.png){.class width=80% key=value}
:::
```

This wrapper:

- becomes an HTML/EPUB element around the native `<figure>`;
- becomes a DOCX bookmark;
- becomes an ODT section;
- becomes a LaTeX label at the figure boundary and an `\hyperref` target.

For non-LaTeX exports, the caption receives `Figure N.` because Pandoc does not
number captions in HTML, EPUB, DOCX, or ODT. For LaTeX/PDF, Pandoc's native
figure counter supplies the number, so the caption is not prefixed.

Automatic references become ordinary `[Figure N](#fig:model)` links before
Pandoc runs. LaTeX therefore receives:

```latex
\hyperref[fig:model]{Figure N}
```

No `\autoref`, `\cref`, or extra LaTeX package is required.

## Errors and edge cases

- A standalone image with empty alt remains an image, not a figure.
- An image with text in its paragraph remains an inline image.
- Repeated IDs resolve to the first figure; every duplicate is marked invalid.
- A figure without an ID is numbered but not referencable.
- Invalid attributes remain source text and produce no target.
- A missing image file keeps its figure number and caption, with the existing
  broken-image presentation.
- A link to a missing figure follows the shared unresolved-reference behavior.

## Tests

Node checks will cover:

- implicit-figure recognition;
- inline and empty-alt images staying outside the figure sequence;
- ID/class/key-value parsing;
- malformed and non-final attribute blocks;
- source serialization;
- figure numbering with labeled and unlabeled figures;
- duplicate IDs and first-match resolution;
- automatic-reference rewriting.

Tauri probes will cover:

- rendered figure, caption, and number;
- image click and source editing;
- attribute visibility and one-step caret exit;
- command-click to a virtualized figure;
- live renumbering after inserting a figure;
- `[#fig:id]` source mode;
- default fixture behavior;
- image loading from both existing search locations.

Export probes will cover:

- processed Markdown references and numbering;
- HTML and EPUB anchors;
- DOCX bookmarks;
- ODT section targets;
- LaTeX label and `\hyperref`;
- PDF compilation;
- preservation of classes and key/value attributes.

## Documentation and fixture

The user documentation will explain:

- what makes an image a figure;
- how to add a figure ID;
- how figure numbering works;
- the difference between `[text](#id)` and `[#id]`;
- command-click navigation;
- cross-format export behavior.

`test/fixtures/workspace/default-document.md` will include:

- an unlabeled figure that advances the sequence;
- a labeled figure with class and key/value attributes;
- an inline image that does not advance the sequence;
- manual and automatic references to the labeled figure.

## Implementation dependency

Figure implementation starts after the shared target index and `[#id]` reference
layer from the general cross-reference specification.

## Out of scope

- subfigures;
- figure panels or per-panel references;
- rich multi-paragraph captions;
- automatic figure IDs;
- cross-document references;
- applying arbitrary figure classes to Yi's editor DOM;
- configurable numbering styles.
