# GitHub-style callouts

## Scope

This specification adds GitHub-style alert syntax to Yi and renders those
blockquotes as callouts in the editor.

It adds:

- five built-in callout kinds: note, tip, important, warning and caution;
- GitHub-style alert syntax for the five built-in kinds;
- Pandoc fenced-Div syntax for built-in and custom callout kinds;
- one shared quote-container model for ordinary quotes and GitHub-style
  callouts;
- nested quote and callout depths;
- a rendered callout that can contain ordinary Markdown blocks;
- whole-block source editing while the caret is inside the callout;
- context-aware Enter editing for ordinary quotes and callouts;
- navigable caret anchors for empty callout and fenced-Div bodies;
- escaping and rejection rules that leave ordinary blockquotes unchanged;
- a semantic Pandoc `Div` lowering for every Pandoc-backed export;
- a stable class contract for template-package Lua filters;
- Documentation, tests and default-document examples.

Pandoc's `alerts` extension is not enabled. Yi recognizes the source and
performs the lowering itself, so the editor and every export follow the same
grammar.

Callout cross-references, folding and icons are outside this release.

## Source syntax

The canonical source is:

```markdown
> [!NOTE]
> Something worth noticing.
```

The marker must be the first content line of the innermost blockquote at the
caret's context. It is recognized case-insensitively and the five canonical
spellings are:

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

### Fenced-Div form

The general Pandoc form is also accepted:

```markdown
::: {.callout .callout-note}
Something worth noticing.
:::
```

The shorter forms are accepted for compatibility:

```markdown
::: {.callout-note}
Something worth noticing.
:::
```

`callout-note` may be replaced by a built-in kind (`tip`, `important`,
`warning`, `caution`) or a custom kind identifier using lower-case ASCII
letters, digits, `_` and `-`.

For a built-in kind, the default title is the fixed title from the table
below. A custom kind uses `title="…"` when supplied; otherwise its class suffix
becomes a non-localised title with `-` and `_` shown as spaces and each word
capitalised:

```markdown
::: {.callout .callout-definition title="Definition"}
A defined term.
:::
```

The opening fence may use three or more colons. Its closing fence must use at
least as many colons. The complete fenced Div must be a block of its own.

The following attributes are preserved for export:

- the callout-kind class;
- an optional ID;
- other classes;
- string attributes, including `title`.

An ID is ordinary Pandoc metadata in this release; it does not create a Yi
cross-reference target.

The source keeps whichever form the author wrote. The editor normalises both
forms into one internal callout model, and export normalises both into the same
`Div` contract.

### Marker grammar

The opening line is recognized only when all of these are true:

- it has zero to three leading spaces;
- it has one or more blockquote markers `>`, each followed by at most one
  separation space;
- the alert label is one of the five names above;
- the marker occupies the rest of the line, apart from trailing spaces.

Each `>` in that prefix opens one quote level. A callout marker in
`> > [!NOTE]` therefore creates a callout inside an ordinary quote:

```markdown
> > [!NOTE]
> > Nested callout body.
```

The marker and body share the same outer-to-inner quote chain.

A marker with text after it is ordinary source:

```markdown
> [!NOTE] this is ordinary quoted prose
```

The following are not callout openings:

```markdown
> [!CUSTOM]
>  [!NOTE]
```

They remain ordinary blockquotes. GitHub marker syntax accepts only the five
built-in names. A custom kind uses the fenced-Div form.

An escaped marker is a literal blockquote:

```markdown
> \[!NOTE]
> This is quoted prose, not a callout.
```

### Body

When a GitHub-style callout is nested, every body line carries the same
blockquote prefix as its marker:

```markdown
> > [!TIP]
> > First paragraph.
> >
> > - a list item
> > - another item
```

An un-nested callout has the more familiar form:

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

The innermost quote carrier belongs to the callout itself. Removing that
carrier exposes the callout body; outer carriers remain as the ordinary quote
containers around it. A fenced-Div callout needs no carrier removal.

The body is parsed as ordinary Markdown. It may contain paragraphs, headings,
lists, task lists, code fences, tables, equations, captions, citations, images
and nested ordinary blockquotes.

An actual blank line without the required quote prefix ends the callout. More
quoted content after that blank line is a new block, not a continuation.

A lazy continuation line missing any required quote level also prevents
callout recognition. The complete source then remains an ordinary blockquote.
This rule avoids moving lines between a callout and the blockquote semantics
CommonMark gives them.

An empty callout is valid:

```markdown
> [!NOTE]
```

It renders its title and an editable empty body line.

## Block model

The block splitter gains two block kinds:

- `quote`, for a contiguous stack of ordinary blockquote lines, including a
  GitHub-style callout at one level of that stack;
- `fencedDiv`, for a contiguous Pandoc fenced Div.

A `quote` block retains its complete outer-to-inner level stack. A callout is
metadata on the innermost matching level, not a second interpretation of the
same characters. Ordinary quote levels outside that callout remain ordinary
quote containers.

A `fencedDiv` becomes a callout block only when its opening attributes identify
exactly one callout kind. Other fenced Divs keep their ordinary Pandoc model.

The block's raw source remains unchanged. It carries:

- the canonical kind (`note`, `tip`, `important`, `warning` or `caution`);
- the visible title;
- the authoring form (`alert` or `div`);
- the active quote depth for `alert`;
- any preserved ID, class and key/value attributes for `div`;
- the source range of the marker line;
- the source ranges of the body;
- the parsed body blocks.

The source reader is a pure syntax module. It does not parse rendered
Markdown and does not reach into the DOM. It returns `null` when the strict
marker, continuation or escape rules do not hold, which leaves the existing
blockquote pipeline in charge.

The body parser removes exactly the callout's own blockquote layer. Outer
quote layers remain around the callout, and an explicit quote inside the body
remains a nested quote:

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

Ordinary blockquotes use this same source-visible rule. For both containers the
complete block source is the editable surface, including outer `>` carriers,
escaped markers, empty quoted lines and child delimiters. This is what keeps a
click and Enter aligned with the characters the reader can see.

Outside source mode, an ordinary quote uses a two-sided inset and one oversized
opening quotation mark. The typography plugin's thick inline-start rule and its
paired opening/closing glyphs are removed; there is no closing decoration.

Clicking the rendered panel enters source mode:

- a click on the title enters the marker line;
- a click in the body enters the nearest exact body source position;
- when the body is empty, the caret enters the invisible body anchor described
  below.

The rendered block and the source block are two shapes of one block, not two
document blocks. Switching shapes preserves scroll position and the logical
caret.

### Empty callout navigation

An empty callout or fenced-Div callout still needs a caret destination. The
rendered panel therefore carries one invisible body anchor with a real
document offset and a visible line box, even when the body has no characters.

The anchor has these properties:

- it belongs to the callout body, not to the title or an adjacent block;
- it has a non-zero line height but no selectable text;
- it maps to the point where the first body character would be written;
- its offset includes the complete outer quote prefix for a GitHub-style
  callout;
- it remains inside the callout when the caret leaves and the rendered panel
  returns.

Arrow navigation treats the anchor as the callout's sole body position:

- ArrowRight from the block before an empty callout enters the anchor;
- ArrowLeft from the block after an empty callout enters the same anchor;
- entering the anchor switches the callout to source mode and places the
  logical caret there;
- ArrowLeft or ArrowRight may then leave source mode again;
- moving back toward the callout from either adjacent block returns to the
  anchor rather than skipping the empty container.

For a marker-only GitHub callout:

```markdown
> [!NOTE]
```

the body insertion point is after the marker line. Typing there materialises
the required quoted body line:

```markdown
> [!NOTE]
> New body
```

For an empty fenced-Div callout:

```markdown
::: {.callout-note}
:::
```

the insertion point is before the closing fence. Typing there materialises one
body line:

```markdown
::: {.callout-note}
New body
:::
```

The navigation does not insert a newline merely because the caret passed over
an empty callout. Source changes happen only when the author starts typing or
performs an edit. Multiple adjacent empty callouts keep distinct anchors and
are traversed in document order.

A GitHub alert uses the ordinary quoted-paragraph Enter rule on its opening
marker: Enter creates two quoted empty lines and places the caret at the end of
the second. A subsequent Enter removes those carriers and exits the callout.
An empty fenced-Div opening is the one special case: Enter creates one body line
before its closing fence and places the caret there.

A nested empty callout uses the same rule at its innermost body position.
Typing materialises a body line with the complete outer quote prefix, so an
empty callout inside another callout cannot accidentally become top-level
text.

## Enter inside quote containers

Ordinary blockquotes and GitHub-style callouts use one shared, context-aware
Enter rule. A callout is not a separate newline implementation.

The editor determines which container and child block hold the caret:

- the full `>` prefix chain from the outermost quote to the active container;
- the innermost quote or callout level;
- the child block at the caret: paragraph, list item, table cell, code fence,
  equation or another completed block.

Every physical line inserted inside the quote carries the full active prefix.
A new line at depth two starts `> >`; a new line at depth one starts `>`.

### Paragraph break

At the end of:

```markdown
> A line
```

the first Enter writes two quoted empty lines:

```markdown
> A line
>
>
```

The caret is after the final `>`. The string is inserted as one edit and is
one undo step. The first empty line is the paragraph separator; the second is
the editable paragraph. When the next printable character is typed, Yi writes
only that character because the visible source has no delimiter space:

```markdown
> A line
>
>B line
```

The intermediate source has no trailing spaces that another Markdown tool
could mistake for a hard break.

The intermediate `>` lines do not acquire a delimiter space by themselves.
Typing on a blank `>` line produces `>B`, while a source line that already
contains the visible `> ` keeps that space when the reader types after it. This
rule applies equally to quotes and callouts.

Backspace or Delete on a blank quoted line removes that whole physical line,
including its adjacent newline. Removing the final line removes the preceding
newline instead. The action never stops at deleting only the marker.

Enter on an empty list item removes that item's marker and returns the line to
the quote or callout body. The edit replaces only the block-relative line span,
using document offsets, so quotes and callouts after earlier text keep their
prefixes and neighboring content intact.

Inserting a table while the caret is inside a quote or GitHub-style callout
applies the active source prefix to every table row and separator. The table
therefore remains one child block of the container instead of terminating it.

When Enter is used in the middle of a line, the text after the caret moves to
the new quoted paragraph:

```markdown
> First half
>
> second half
```

### Enter inside a fenced-Div callout

A fenced-Div body does not use paragraph splitting. Enter inserts exactly one
newline at the caret, so one press creates one new line and successive presses
can create any number of blank lines. The caret remains on the newest line. A
Div nested inside a quote writes the exact visible quote prefix for that new
line so it remains inside the same container.

### Double Enter exits one level

When the caret is on the empty paragraph produced by the paragraph-break rule,
a second consecutive Enter removes exactly one quote level from the empty
lines and leaves the caret in the parent quote container.

At depth one:

```markdown
> A line
>
>
```

becomes:

```markdown
> A line


```

The callout or quote has ended and the caret is on the ordinary paragraph.

At depth two:

```markdown
> > A line
> >
> >
```

the second Enter becomes:

```markdown
> > A line
>
>
```

Only the inner quote level was removed. The outer quote remains. Another
consecutive Enter removes the outer level:

```markdown
> > A line


```

Thus double Enter exits one container level at a time. It never removes every
`>` merely because the quote is nested.

### Lists, tables, code and equations

Structural child blocks keep their existing Enter rules. The quote layer
changes how inserted source is written, not what Enter means for the child:

- continuing a list adds the next list item with the full quote prefix;
- Enter in a code fence or equation adds the child's own line with the full
  quote prefix;
- table navigation and cell editing keep their existing rules, and any new
  source line receives the full quote prefix;
- indentation and nested-list `>`/whitespace prefixes compose from outermost
  to innermost.

Opening-marker completion is part of the same context rule. A quoted display
formula, labeled equation, code fence and fenced-Div callout creates all of its
delimiter lines with the active quote prefix. The callout-kind chooser remains
available for `:::`. A backtick on an empty quoted line starts literally so the
three-character fence can complete; an auto-paired `]` after `[$$` is part of
the equation opener rather than a reason to leave it literal.

Citation completion after `@`, wikilink completion after `[[`, and automatic
reference completion after `[#` use the document text, so they remain available
inside both source-visible forms. Accepting one writes only the key or target
ID and leaves the surrounding container source intact.

For example, a list item at depth two:

```markdown
> > - First item
```

continues as:

```markdown
> > - First item
> > - next item
```

The child block decides that a new item is needed; the quote rule only carries
the prefix.

After a structural child has closed, Enter uses the same two-line quoted
paragraph break as any other non-empty line:

```markdown
> > $$
> > x = 1
> > $$
> >
> >
```

The equation is already a block boundary, but the author still gets the same
editable paragraph break as elsewhere. A second Enter on those two lines
removes one quote level, following the same one-level-at-a-time rule.

### Fenced-Div callouts

A fenced-Div callout has no quote carrier of its own. Its body and child blocks
use ordinary Markdown editing rules. If the Div itself is nested inside an
ordinary quote, the quote container still supplies its own prefix and the same
one-level exit rule.

The line edits are pure rules beside the existing list, table and blank-line
edits. Each returns one raw replacement and the resulting caret offset. The
rule is derived from the document and caret context; it holds no timer and no
"last key" state.

## Export

The note's source is not rewritten for saving or copying. Export lowering
happens on the text handed to Pandoc.

Every recognized callout receives a fenced `Div`, never native `alerts`:

```markdown
:::: {.callout .callout-note}
::: {.callout-title}
Note
:::

Something worth noticing.
::::
```

Rules:

- the outer fence is longer than every fenced construct in its body and uses at
  least four colons;
- `.callout` names the family and `.callout-note` names the kind;
- `.callout-title` contains the fixed visible title;
- a GitHub-style callout removes its own innermost quote layer;
- an outer quote around a nested callout remains around the generated Div and
  its body;
- a fenced-Div callout keeps its own body unchanged;
- nested blockquotes inside either form keep their `>` markers;
- body blocks are serialized as their original Markdown, apart from the
  callout's own outer quote carrier;
- an ID and non-kind attributes from a fenced-Div source are preserved on the
  generated outer Div;
- a custom title is written both as the visible `.callout-title` content and
  as the outer `title` attribute for filters;
- the source order inside the body is unchanged;
- no GitHub marker reaches Pandoc;
- native `alerts` remains disabled, so this lowering has one owner.

The `Div` is semantic, not a promise that every writer draws a coloured box by
default. HTML and EPUB templates may style the three classes with CSS.
Reference documents for DOCX and ODT may supply corresponding styles.
LaTeX/PDF templates may style the `Div` or rewrite it with a Lua filter.

### Lua-filter contract

A template package's Lua filter receives the outer `Div` with:

- class `callout`;
- exactly one class beginning `callout-` that names the kind;
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
- Changing the innermost callout class from `.callout-note` to
  `.callout-tip` re-renders the fenced-Div callout with the new title and
  colour.
- Typing `:::` on a line of its own creates
  `::: {.callout .callout-note}` with a closed `:::` fence and opens a picker
  for Note, Tip, Important, Warning, Caution and Definition. A choice rewrites
  only `.callout-<kind>`; other source bytes do not move.
- Deleting or malforming a GitHub marker makes that innermost quote level an
  ordinary blockquote after the edit settles; outer quote levels remain.
- Malforming or removing a fenced-Div callout class makes the source an
  ordinary Pandoc fenced Div.
- Changing an unknown marker to a known one turns the ordinary blockquote into
  a callout.
- Adding an unquoted line inside a callout makes callout recognition fail; the
  text is not discarded or silently moved.
- Deleting the final body line leaves a valid empty callout in either source
  form.
- Undo and redo restore the exact previous marker, body, block shape and caret.
- Paste into a GitHub-style callout prefixes every pasted physical line with
  the full active quote chain.
- Paste into a fenced-Div callout uses ordinary block paste rules and does not
  invent `>` carriers.
- Paste never removes an outer quote level on the reader's behalf.

## Component boundaries

The implementation should keep these responsibilities separate:

| Module | Responsibility |
| --- | --- |
| `syntax/callouts.ts` | GitHub marker grammar, fenced-Div recognition, kind/title mapping, quote-layer stripping and source ranges |
| `syntax/quote_edits.ts` | Pure context-aware Enter, double-Enter and prefixed child-edit rules for every quote depth |
| `syntax/callout_body.ts` | Pure empty-body insertion points and the first-typing materialisation rules for both source forms |
| `document/blocks.ts` | Recognize and bound `quote` and callout-bearing `fencedDiv` blocks |
| `document/block_kinds.ts` | Distinguish quote containers, source-mode callouts and ordinary fenced Divs |
| `plugins/remark-callouts.ts` | Normalize both source forms into one callout model and preserve nested quote levels |
| `nodes/callout.ts` | Render the panel, title and parsed body |
| `caret/navigation.ts` | Treat an empty callout body anchor as a real caret destination from either side |
| `create_block.ts` | Choose the rendered callout or the complete source view |
| `editing/keys.ts` and the quote edit command | Route Enter and child-block edits through the active quote context |
| `ui/export/callout_rewrites.ts` | Lower source blocks to the semantic fenced `Div` |
| `styles.css` | Theme-aware panel, title and kind accents |

The syntax modules remain DOM-free. The renderer does not reinterpret the
marker grammar. Ordinary blockquotes and callouts share the same newline-edit
rule but have separate render decisions. The exporter reads the same source
model as the editor, so the editor and export cannot disagree about what is a
callout.

## Errors and edge cases

- `[!NOTE]` inside a code fence, inline code, math or frontmatter is literal.
- A callout marker must open its innermost blockquote level; a later
  `[!NOTE]` line is prose.
- Up to three leading spaces are accepted before the first blockquote marker.
- More than one separation space after a `>` keeps that level's marker line as
  ordinary blockquote source.
- Trailing spaces after `[!TYPE]` are accepted and preserved in source.
- Unknown labels and labels with suffix text remain ordinary blockquotes.
- The escaped marker remains ordinary source and displays `[!NOTE]`.
- Actual blank lines end the quote stack even when a later line starts with
  `>`.
- Nested ordinary blockquotes and nested GitHub-marker callouts retain one
  model level per `>`.
- Nested callouts use the same one-level-at-a-time Enter exit rule.
- Fenced-Div callouts may nest when their fence lengths follow Pandoc's fenced
  Div rules.
- A callout may contain a captioned list or table; the existing caption
  grammar remains in charge after the callout's own quote layer is removed.
- Empty and marker-only GitHub callouts remain editable.
- A fenced-Div callout with no body remains editable.
- ArrowLeft and ArrowRight re-enter an empty callout from either adjacent
  block instead of skipping it.
- An empty callout never borrows the caret anchor of its title, a neighboring
  block or the paragraph after it.
- Passing over an empty callout with an arrow key does not edit the document.
- Callouts have no generated IDs. An author-supplied Div ID is preserved for
  Pandoc and filters but does not participate in Yi cross-reference numbering.

## Tests

Pure checks will cover:

- all five case-insensitive marker spellings;
- nested marker recognition at one, two and three quote depths;
- exact marker boundaries, leading spaces, trailing spaces and extra suffix
  text;
- escaped and unknown markers remaining ordinary blockquotes;
- built-in and custom fenced-Div callout recognition;
- fenced-Div title, ID, class and attribute preservation;
- direct body syntax without a quoted separator;
- optional quoted separator syntax;
- empty callouts;
- body extraction that removes exactly the callout's own quote layer while
  preserving outer quote levels;
- nested lists, fences, tables and blockquotes in a callout body;
- block splitting and re-splitting after generated Enter edits;
- Enter at the end and middle of a quoted paragraph;
- double Enter removing exactly one quote level from empty lines;
- context-aware Enter in lists, tables, code fences and equations;
- a two-line quoted paragraph break after a completed child block;
- the next text character materializing the delimiter space after a bare `>`;
- prefix expansion for child edits at nested quote depths;
- exact source serialization and one-step undo;
- callout lowering to `.callout` and the five kind classes;
- fenced-Div and GitHub-alert forms normalising to the same export shape;
- title and body preservation in the generated `Div`;
- no callout parsing inside code, math or frontmatter.

Tauri probes will cover:

- all five rendered titles and theme classes;
- direct and separated body forms;
- multiple paragraphs, lists, code, tables and a captioned list inside a
  callout;
- nested ordinary quotes and nested callouts;
- ordinary blockquotes and escaped markers staying ordinary;
- rendered-to-source and source-to-rendered transitions;
- click-to-source offset mapping;
- Enter followed by typing, Backspace, undo and redo;
- double Enter exiting one nested quote level at a time;
- Enter inside quoted list, table, code and equation contexts;
- completion of display math, labeled equations, code fences, callout Divs and
  their chooser surfaces while quoted or called out;
- citation, wikilink and automatic-reference completion inside both container
  source forms;
- a two-line paragraph break after a completed child block;
- equivalent editing through GitHub and fenced-Div callout source;
- caret line stability across a callout rebuild;
- empty callout editing;
- empty marker-only and fenced-Div callouts entered from both the preceding
  and following block with ArrowLeft/ArrowRight;
- leaving an empty callout and returning to its body anchor without a source
  edit;
- first typing in an empty callout materialising the correct quote or Div body
  line;
- Enter on an empty GitHub callout opening creating two quoted lines and a
  second Enter exiting it; one Div body line before the closing fence;
- multiple adjacent empty callouts remaining distinct navigation stops;
- a nested empty callout preserving every outer quote prefix;
- a long callout in a virtualised document;
- examples in the default fixture.

Export checks will cover:

- one fenced `Div` for each Pandoc-backed kind;
- the five class and title mappings;
- custom fenced-Div kind and title preservation;
- no dependency on Pandoc's `alerts` extension;
- nested quote levels retained around and inside callouts;
- nested fences not closing the outer Div;
- HTML/EPUB class preservation;
- a template-package Lua filter receiving the callout and rewriting it to a
  native LaTeX environment;
- content remaining visible in LaTeX/PDF without a callout filter;
- processed Markdown containing the same semantic wrapper.

## Documentation and fixture

The Documentation in every shipped language will explain:

- the five GitHub-style markers;
- the fenced-Div form for built-in and custom kinds;
- direct and optional-separator body forms;
- multiple paragraphs, Enter and the one-level double-Enter exit;
- nested quote and callout depth;
- context-aware Enter after and inside lists, tables, code fences and
  equations;
- the escape for a literal `[!NOTE]`;
- unknown markers remaining ordinary blockquotes;
- that callout titles are fixed English Markdown vocabulary rather than UI
  translations;
- the rendered editor appearance and source editing;
- how an empty callout remains reachable with Left and Right arrows from
  either side;
- the exported `.callout`, `.callout-<kind>` and `.callout-title` classes;
- how template-package Lua filters can style or replace callouts for
  LaTeX/PDF;
- which construct-specific features are supported inside the body.

The default Markdown fixture will include:

- all five kinds;
- built-in and custom fenced-Div callouts;
- the no-separator and quoted-separator forms;
- multi-paragraph and nested callouts;
- marker-only and empty fenced-Div callout navigation cases;
- a list, a table and a code fence inside callouts;
- an escaped marker;
- ordinary blockquotes next to callouts.

## Out of scope

- Pandoc's native `alerts` extension;
- arbitrary `[!TYPE]` authoring names in GitHub shorthand;
- callout cross-references and automatic numbering;
- localized built-in titles;
- collapsible callouts;
- custom icons;
- a mandatory LaTeX callout package or filter;
- changing ordinary blockquote rendering beyond the shared Enter rules.
