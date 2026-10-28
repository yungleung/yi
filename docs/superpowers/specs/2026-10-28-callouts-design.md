# GitHub-style callouts

## Scope

This specification adds GitHub-style alert syntax to Yi and renders those
blockquotes as callouts in the editor.

It adds:

- five built-in callout kinds: note, tip, important, warning and caution;
- a distinct block-level model for a callout;
- a rendered callout that can contain ordinary Markdown blocks;
- whole-block source editing while the caret is inside the callout;
- a quoted paragraph-break command for Shift+Enter;
- escaping and rejection rules that leave ordinary blockquotes unchanged;
- a semantic Pandoc `Div` lowering for every Pandoc-backed export;
- a stable class contract for template-package Lua filters;
- Documentation, tests and default-document examples.

Pandoc's `alerts` extension is not enabled. Yi recognizes the source and
performs the lowering itself, so the editor and every export follow the same
grammar.

Callout IDs, cross-references, custom titles, folding, icons, nested callouts
and user-registered authoring kinds are outside this release.

## Source syntax

The canonical source is:

```markdown
> [!NOTE]
> Something worth noticing.
```

The marker must be the first content line of a blockquote. It is recognized
case-insensitively and the five canonical spellings are:

```markdown
> [!NOTE]
> [!TIP]
> [!IMPORTANT]
> [!WARNING]
> [!CAUTION]
```

The visible titles are fixed as `Note`, `Tip`, `Important`, `Warning` and
`Caution`. They do not depend on the application locale. The document's words
must not change when the UI language changes.

A quoted blank line may separate the marker from the body:

```markdown
> [!NOTE]
>
> Something worth noticing.
```

It is optional. The direct form is the same callout:

```markdown
> [!NOTE]
> Something worth noticing.
```

### Marker grammar

The opening line is recognized only when all of these are true:

- it has zero to three leading spaces;
- it has one blockquote marker `>`;
- the marker has at most one separation space after it;
- the alert label is one of the five names above;
- the marker occupies the rest of the line, apart from trailing spaces.

A marker with text after it is ordinary source:

```markdown
> [!NOTE] this is ordinary quoted prose
```

The following are not callout openings:

```markdown
> [!CUSTOM]
>> [!NOTE]
>  [!NOTE]
```

They remain ordinary blockquotes. A future feature may register custom
authoring names; the source grammar does not accept arbitrary names in this
release.

An escaped marker is a literal blockquote:

```markdown
> \[!NOTE]
> This is quoted prose, not a callout.
```

### Body

Every body line is an explicit blockquote line:

```markdown
> [!TIP]
> First paragraph.
>
> - a list item
> - another item
>
> ```js
> const answer = 42;
> ```
```

After the single outer quote marker and its optional separation space are
removed, the body is parsed as ordinary Markdown. It may contain paragraphs,
headings, lists, task lists, code fences, tables, equations, captions,
citations, images and nested ordinary blockquotes.

An actual blank line without `>` ends the callout. More quoted content after
that blank line is a new block, not a continuation.

An unquoted lazy continuation line also prevents callout recognition. The
complete source then remains an ordinary blockquote. This rule avoids moving
lines between a callout and the blockquote semantics CommonMark gives them.

An empty callout is valid:

```markdown
> [!NOTE]
```

It renders its title and an editable empty body line.

## Block model

The block splitter gains one kind, `callout`. A callout block begins at a
matching marker line and consumes the contiguous run of blockquote lines.
Quoted blank lines belong to that run.

The block's raw source remains unchanged. It carries:

- the canonical kind (`note`, `tip`, `important`, `warning` or `caution`);
- the visible title;
- the source range of the marker line;
- the source ranges of the body;
- the parsed body blocks.

The source reader is a pure syntax module. It does not parse rendered
Markdown and does not reach into the DOM. It returns `null` when the strict
marker, continuation or escape rules do not hold, which leaves the existing
blockquote pipeline in charge.

The body parser removes exactly one blockquote layer. A nested quote remains a
quote:

```markdown
> [!NOTE]
> Outer callout.
>
> > A quotation inside the callout.
```

No new block kind is invented for each child construct. Lists, tables and the
other existing blocks keep their current parsing and editing rules inside the
callout body.

## Editor rendering

While the caret is outside the callout, the block renders as one semantic
callout:

- a bordered panel with a kind-coloured accent;
- one fixed title row;
- the parsed body below it;
- no visible `>` or `[!TYPE]` marker;
- the block has one `.markdown-callout-block` editor wrapper and one
  `.markdown-callout` surface.

The five kinds use distinct theme colours:

| Kind | Title | Editor colour |
| --- | --- | --- |
| note | Note | info |
| tip | Tip | success |
| important | Important | primary |
| warning | Warning | warning |
| caution | Caution | error |

The visual treatment uses theme tokens rather than fixed light/dark colours.
The title is not localised.

The body is rendered by the existing Markdown renderer. Its ordinary blocks
remain the only source of visible body text, so links, lists, equations,
captions, footnotes and other existing constructs work inside it.

### Editable source

A callout is a source-mode block. While the caret is inside it, the complete
raw block is shown, including every `>` marker and the alert label. This keeps
editing exact and reuses the same source-offset contract as equations and
fenced blocks.

Leaving the block restores the rendered callout. Re-entering it restores the
same source and document offset.

Clicking the rendered panel enters source mode:

- a click on the title enters the marker line;
- a click in the body enters the nearest exact body source position;
- when the body is empty, the caret enters the empty body line after the
  marker.

The rendered block and the source block are two shapes of one block, not two
document blocks. Switching shapes preserves scroll position and the logical
caret.

## Shift+Enter

Shift+Enter creates another paragraph inside the current callout. It never
creates an unquoted paragraph that would end the callout.

At the end of:

```markdown
> A line
```

Shift+Enter writes two quoted empty lines:

```markdown
> A line
>
>
```

The caret is after the final `>`. The string is inserted as one edit and is
one undo step.

When the next printable character is typed at that caret, Yi writes the quote
delimiter space and the character:

```markdown
> A line
>
> B line
```

The separator line is the first `>`; the second `>` became the editable
paragraph. The intermediate source has no trailing spaces that another
Markdown tool could mistake for a hard break.

When Shift+Enter is used in the middle of a line, the text after the caret
moves to the new quoted paragraph:

```markdown
> First half
>
> second half
```

The edit preserves the current callout's outer quote prefix. For a body line
nested further by ordinary Markdown, the inserted lines carry the same
outer-prefix structure and leave the inner Markdown intact.

Shift+Enter outside a callout keeps its existing editor behaviour. Ordinary
Enter inside a callout retains the normal block rule: at the end of the
callout it creates an ordinary following paragraph and therefore leaves the
callout.

The line edit is a pure rule beside the existing list, table and blank-line
edits. It returns one raw replacement and the resulting caret offset.

## Export

The note's source is not rewritten for saving or copying. Export lowering
happens on the text handed to Pandoc.

Every Pandoc-backed kind receives a fenced `Div`, never native `alerts`:

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Something worth noticing.
::::
```

Rules:

- the outer fence uses four colons so nested fenced divs and code fences cannot
  close it accidentally;
- `.callout` names the family and `.callout-note` names the kind;
- `.callout-title` contains the fixed visible title;
- exactly one outer blockquote layer is removed from the body;
- nested blockquotes keep the remaining `>` markers;
- body blocks are serialized as their original Markdown, apart from the
  callout's own outer quote carrier;
- the source order inside the body is unchanged;
- no Yi-only marker reaches Pandoc;
- native `alerts` remains disabled, so this lowering has one owner.

The `Div` is semantic, not a promise that every writer draws a coloured box by
default. HTML and EPUB templates may style the three classes with CSS.
Reference documents for DOCX and ODT may supply corresponding styles.
LaTeX/PDF templates may style the `Div` or rewrite it with a Lua filter.

### Lua-filter contract

A template package's Lua filter receives the outer `Div` with:

- class `callout`;
- exactly one class from `callout-note`, `callout-tip`,
  `callout-important`, `callout-warning` or `callout-caution`;
- a child `Div` with class `callout-title`;
- the body blocks after that title.

A filter may replace the outer `Div` with a native LaTeX environment such as
`tcolorbox`, `mdframed` or a class-specific environment. It must preserve or
deliberately consume:

- the kind class;
- the visible title text;
- every body block in document order.

Yi does not match a particular LaTeX package and does not ship a mandatory
callout filter. The generated title and body remain visible without one, so
content is never lost when a template has no callout styling.

The conversion runs before template filters:

```text
Yi GitHub-style callout source
        ↓
fenced Div in export Markdown
        ↓
Pandoc parse
        ↓
template-package Lua filters
        ↓
Pandoc writer
```

Processed Markdown uses the same fenced `Div` representation. This keeps the
source deterministic and lets an editor or downstream tool recognize a
semantic callout even when it does not render native GitHub alerts.

## Other source edits and transitions

- Changing a marker from `NOTE` to `TIP` re-renders the panel with the new
  title and colour.
- Deleting or malforming the marker makes the source an ordinary blockquote
  after the edit settles.
- Changing an unknown marker to a known one turns the ordinary blockquote into
  a callout.
- Adding an unquoted line inside a callout makes callout recognition fail; the
  text is not discarded or silently moved.
- Deleting the final body line leaves a valid empty callout.
- Undo and redo restore the exact previous marker, body, block shape and caret.
- Paste keeps pasted body blocks inside quoted lines only when every inserted
  line carries the required quote carrier; otherwise the normal Markdown
  blockquote rules apply.

## Component boundaries

The implementation should keep these responsibilities separate:

| Module | Responsibility |
| --- | --- |
| `syntax/callouts.ts` | Strict marker grammar, kind/title mapping, outer-line stripping and source ranges |
| `syntax/callout_edits.ts` | Pure Shift+Enter insertion and caret result |
| `document/blocks.ts` | Recognize and bound one `callout` block |
| `document/block_kinds.ts` | Declare source-mode behaviour for a callout and keep it out of fenced-block behaviour |
| `plugins/remark-callouts.ts` | Attach parsed callout metadata and body blocks without changing source |
| `nodes/callout.ts` | Render the panel, title and parsed body |
| `create_block.ts` | Choose the rendered callout or the complete source view |
| `editing/keys.ts` and the callout edit command | Route Shift+Enter inside a callout to the pure edit |
| `ui/export/callout_rewrites.ts` | Lower source blocks to the semantic fenced `Div` |
| `styles.css` | Theme-aware panel, title and kind accents |

The syntax modules remain DOM-free. The renderer does not reinterpret the
marker grammar. The exporter reads the same source model as the editor, so the
editor and export cannot disagree about what is a callout.

## Errors and edge cases

- `[!NOTE]` inside a code fence, inline code, math or frontmatter is literal.
- A callout marker must open the blockquote; a later `[!NOTE]` line is prose.
- Up to three leading spaces are accepted before the blockquote marker.
- More than one separation space after `>` keeps the source as an ordinary
  blockquote.
- Trailing spaces after `[!TYPE]` are accepted and preserved in source.
- Unknown labels and labels with suffix text remain ordinary blockquotes.
- The escaped marker remains ordinary source and displays `[!NOTE]`.
- Actual blank lines end the callout even when a later line starts with `>`.
- A callout body may contain nested ordinary blockquotes.
- A callout may contain a captioned list or table; the existing caption
  grammar remains in charge after one outer quote layer is removed.
- Nested callouts are not recognized in this release.
- Empty and marker-only callouts remain editable.
- Callouts have no generated IDs and do not participate in cross-reference
  numbering.

## Tests

Pure checks will cover:

- all five case-insensitive marker spellings;
- exact marker boundaries, leading spaces, trailing spaces and extra suffix
  text;
- escaped, unknown and doubly nested markers remaining ordinary blockquotes;
- direct body syntax without a quoted separator;
- optional quoted separator syntax;
- empty callouts;
- body extraction that removes exactly one quote layer;
- nested lists, fences, tables and blockquotes in a callout body;
- block splitting and re-splitting after generated Shift+Enter edits;
- Shift+Enter at the end and middle of a line;
- the next text character materializing the delimiter space after a bare `>`;
- exact source serialization and one-step undo;
- callout lowering to `.callout` and the five kind classes;
- title and body preservation in the generated `Div`;
- no callout parsing inside code, math or frontmatter.

Tauri probes will cover:

- all five rendered titles and theme classes;
- direct and separated body forms;
- multiple paragraphs, lists, code, tables and a captioned list inside a
  callout;
- ordinary blockquotes and escaped markers staying ordinary;
- rendered-to-source and source-to-rendered transitions;
- click-to-source offset mapping;
- Shift+Enter followed by typing, Backspace, undo and redo;
- caret line stability across a callout rebuild;
- empty callout editing;
- a long callout in a virtualised document;
- examples in the default fixture.

Export checks will cover:

- one fenced `Div` for each Pandoc-backed kind;
- the five class and title mappings;
- no dependency on Pandoc's `alerts` extension;
- nested Markdown retained after quote stripping;
- nested fences not closing the outer Div;
- HTML/EPUB class preservation;
- a template-package Lua filter receiving the callout and rewriting it to a
  native LaTeX environment;
- content remaining visible in LaTeX/PDF without a callout filter;
- processed Markdown containing the same semantic wrapper.

## Documentation and fixture

The Documentation in every shipped language will explain:

- the five GitHub-style markers;
- direct and optional-separator body forms;
- multiple paragraphs and Shift+Enter;
- the escape for a literal `[!NOTE]`;
- unknown markers remaining ordinary blockquotes;
- that callout titles are fixed English Markdown vocabulary rather than UI
  translations;
- the rendered editor appearance and source editing;
- the exported `.callout`, `.callout-<kind>` and `.callout-title` classes;
- how template-package Lua filters can style or replace callouts for
  LaTeX/PDF;
- which construct-specific features are supported inside the body.

The default Markdown fixture will include:

- all five kinds;
- the no-separator and quoted-separator forms;
- a multi-paragraph callout;
- a list, a table and a code fence inside callouts;
- an escaped marker;
- ordinary blockquotes next to callouts.

## Out of scope

- Pandoc's native `alerts` extension;
- arbitrary `[!TYPE]` authoring names;
- callout attributes, IDs and cross-references;
- custom titles and localized titles;
- collapsible callouts;
- custom icons;
- nested callouts;
- automatic numbering;
- a mandatory LaTeX callout package or filter;
- changing ordinary blockquote rendering or editing outside callouts.
