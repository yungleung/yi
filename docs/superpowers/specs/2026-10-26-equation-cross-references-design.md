# Equation cross-references

## Scope

This specification builds on
`2026-10-24-cross-reference-targets-design.md` and follows the heading,
figure, code-listing, and table work.

It adds:

- one optional cross-reference target for a display-math block;
- `[#eq:id]` automatic references and ordinary `[text](#eq:id)` links;
- one Yi-owned number for each labeled block;
- editor rendering for plain formulas and KaTeX equation environments;
- suppression of native environment numbering in the editor and every export;
- an autocomplete form for labeled display math;
- a complete environment × ID matrix;
- a consistent lowering pipeline for HTML, EPUB, DOCX, ODT, Processed Markdown,
  LaTeX, and PDF.

Lists remain outside this specification. Per-row equation references and
cross-document equation references are also out of scope.

## Source syntax

### Unlabeled display math

Ordinary display math keeps its current syntax:

```markdown
$$
E = mc^2
$$
```

An unlabeled block has no reference target and no Yi equation number. Any
top-level KaTeX environment numbering is suppressed.

### Labeled display math

A targetable equation is one display-math block inside one Pandoc bracketed
Span:

```markdown
[$$
E = mc^2
$$]{#eq:energy}
```

The trailing Pandoc attribute block follows `$$]` immediately. It may contain
one ID, classes, and key/value attributes:

```markdown
[$$
\begin{aligned}
E &= mc^2\\
p &= mv
\end{aligned}
$$]{#eq:relations .wide data-owner=demo}
```

Rules:

- the wrapper must begin `[$$` and end `$$]{…}`;
- the complete wrapper must be a block of its own;
- one labeled block is one equation target;
- only the explicit ID is applied to the editor DOM;
- classes and key/value attributes are preserved for export;
- a malformed wrapper remains ordinary Markdown;
- the source spelling of the formula, wrapper, and attributes is preserved.

`$${#eq:id}` is not supported. Pandoc reads `{#eq:id}` as the first line of
math, not as an attribute. The ID belongs to the surrounding bracketed Span.

### Autocomplete

Typing `[$$` on an otherwise empty line creates a complete labeled-math
skeleton:

```markdown
[$$

$$]{}
```

The caret lands on the blank formula body line. The same blank lines before and
after the block are written as ordinary display math uses. The `{}` is an empty
attribute placeholder: leaving it empty makes the block unlabeled; entering an
ID makes it a target.

`[$$` typed in prose, inside code, or on a line with other text remains literal.

## Environment matrix

The supported top-level environment families are:

- none;
- `equation`;
- `align`;
- `gather`;
- `alignat`.

The star variants and existing inner variants are also recognized:

- `equation*`;
- `align*`, `aligned`;
- `gather*`, `gathered`;
- `alignat*`, `alignedat`;
- `split`.

Every row is tested with no ID and with an ID.

| Source form | No ID | With `#eq:id` |
| --- | --- | --- |
| Plain formula | Unnumbered display math; no target | One Yi number and target |
| `equation` | Environment number suppressed | Star inner form under one Yi number |
| `equation*` | Already unnumbered | Body under one Yi number |
| `align` | Environment row numbers suppressed | `aligned` under one Yi number |
| `align*` | Already unnumbered | `aligned` under one Yi number |
| `aligned` | Already unnumbered | Existing `aligned` under one Yi number |
| `gather` | Environment row numbers suppressed | `gathered` under one Yi number |
| `gather*` | Already unnumbered | `gathered` under one Yi number |
| `gathered` | Already unnumbered | Existing `gathered` under one Yi number |
| `alignat` | Environment row numbers suppressed | `alignedat` under one Yi number |
| `alignat*` | Already unnumbered | `alignedat` under one Yi number |
| `alignedat` | Already unnumbered | Existing `alignedat` under one Yi number |
| `split` | Already unnumbered | Existing `split` under one Yi number |

Other KaTeX inner environments such as `array`, `matrix`, `cases`, and
`smallmatrix` remain valid math content. They consume no equation number and
are not part of this matrix.

## Environment analysis and lowering

One pure syntax module owns source analysis:

```ts
type EquationEnvironment =
  | 'equation'
  | 'align'
  | 'gather'
  | 'alignat'
  | 'aligned'
  | 'gathered'
  | 'alignedat'
  | 'split';

interface EquationBody {
  environment: EquationEnvironment | null;
  starred: boolean;
  argument: string | null;
  inner: string;
}

function readEquationBody(source: string): EquationBody;
function unnumberedEquationBody(body: EquationBody): EquationBody;
function loweredEquation(body: EquationBody, kind: string): string;
```

`readEquationBody` recognizes one complete top-level environment. Text before
or after it, multiple top-level environments, or unbalanced delimiters are
outside this release and remain ordinary math.

`unnumberedEquationBody`:

- leaves inner environments unchanged;
- changes a top-level `equation`, `align`, `gather`, or `alignat` to its starred
  form;
- keeps `alignat`'s `{n}` argument;
- leaves an already-starred or inner form unchanged.

For a labeled block:

- plain formula becomes one generated `equation`;
- `equation` or `equation*` contributes its body as one `equation`;
- `align` or `align*` becomes `aligned` inside the outer equation;
- `gather` or `gather*` becomes `gathered`;
- `alignat` or `alignat*` becomes `alignedat`, preserving `{n}`;
- existing inner forms remain inner;
- the outer `equation` is the only numbered layer.

Example:

```markdown
[$$
\begin{gather}
x=1\\
y=2
\end{gather}
$$]{#eq:system}
```

Lowered for LaTeX:

```latex
\begin{equation}
\begin{gathered}
x=1\\
y=2
\end{gathered}
\label{eq:system}
\end{equation}
```

The source file is never rewritten by rendering. Lowering creates export text
only.

## Editor model

The labeled wrapper is one block. Its source has four regions:

```text
[$$
formula body
$$]
{#id .class key=value}
```

The block splitter keeps the wrapper as one `equation` block. The pure equation
syntax reader exposes:

```ts
interface EquationBlockSource {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attribute: PandocAttributeBlock | null;
  math: string;
  body: EquationBody;
  source: string;
  from: number;
  to: number;
  mathFrom: number;
  mathTo: number;
}
```

The reference index derives equation entries from the document's equation
blocks, so the wrapper does not depend on remark's bracket-span parsing.
Ordinary `$$…$$` blocks remain ordinary math nodes.

An ID is optional for display. The strict reader produces a target only when
the attributes are well formed; the editor's structural reader still returns
the formula, exact source, and source ranges while an attribute token is
unfinished. The block therefore remains visible until the author completes or
leaves the attribute.

The full-document parse still needs a safe projection for the wrapper. Remark
otherwise reads the closing `$$` as the opening delimiter of a formula that
consumes every later block. `equationsForParsers` replaces the wrapper's opening
bracket and its closing bracket plus attributes with spaces. The projected text
has exactly the same length and line boundaries, so remark sees ordinary display
math and every later mdast position still names the original source offset.
Fenced code, frontmatter, existing display math, and terminating HTML blocks are
left untouched.

The wrapper's source is never reconstructed: block geometry and editing use the
exact document slice.

## Rendering

A labeled equation renders as:

```html
<div class="markdown-block markdown-equation-block" id="eq:energy">
  <div class="markdown-equation-view">…KaTeX…</div>
  <span class="markdown-equation-number" data-chrome="true">(1)</span>
</div>
```

The formula uses `unnumberedEquationBody`, so no KaTeX row-number pseudo-element
is generated. The number is Yi-owned chrome and contributes no document offset.
Its text is only `(N)`, or `(prefix-N)` when the note sets a literal prefix;
the configured equation word belongs to references, not to the block rendering.

When there is no equation target, ordinary display math and unlabeled
environments also use the unnumbered body for preview. This prevents KaTeX CSS
counters from depending on which virtualized blocks happen to be mounted.

Clicking the rendered formula reveals the complete bracketed block, including
`[$$`, `$$]`, and the attributes. While the caret is inside, the dimensions and
source geometry are the same kind as display math. Leaving restores the KaTeX
rendering and label. The revealed source is itself an editable node: a click
inside a formula line resolves to the character clicked, rather than
approximating the formula's rendered glyphs.

The block applies only the ID to its editor DOM. It does not apply arbitrary
classes.

## Numbering and references

Only a labeled equation consumes a Yi equation number:

- `id` is the explicit ID;
- `kind` is `equation`;
- number is the one-based position among labeled equations;
- title is empty;
- source range covers the complete bracketed block;
- primary caret position is the start of the formula body.

The automatic reference:

```markdown
See [#eq:energy].
```

resolves through the shared index and displays the configured label, number,
and parentheses. Default:

```text
Equation (1)
```

Frontmatter:

```yaml
reference-labels:
  equation: Formula
reference-number-prefixes:
  equation: "2-"
```

produces:

```text
Formula (2-1)
```

The same target's visible block number is:

```text
(2-1)
```

Manual references remain ordinary links:

```markdown
See [the energy relation](#eq:energy).
```

Their link text is author-controlled. `[text]{#id}` is a bracketed Span, not a
link, and is not a reference form.

Duplicate IDs follow the shared first-match rule. An unlabeled equation is not
in the index and cannot be referenced.

## Navigation

Command-click or Ctrl-click an equation reference to:

1. resolve the equation entry;
2. reveal its block through virtualization;
3. place the caret at the start of the formula body;
4. leave `location.hash` unchanged.

The visible equation chrome is not a second source.

## Export

### Shared rules

For every writer:

- an unlabeled equation is not numbered;
- a labeled equation is one numbered target;
- native top-level environment numbering is suppressed;
- one Yi-owned number is added only to a labeled equation;
- inner environments are never separately numbered;
- formula source remains unchanged in the note;
- automatic references become ordinary links or native LaTeX references.
- each labeled non-LaTeX equation is laid out in one row with two cells:
  formula first, visible number second.

### HTML and KaTeX

HTML uses `html-math-method: katex`. It therefore receives an unnumbered lowered
body. A labeled equation becomes:

```html
<div id="eq:energy" class="equation-target equation-layout">
  <table class="equation-layout" role="presentation">
    <tr>
      <td class="equation-math-cell">

$$
E = mc^2
$$

      </td>
      <td class="equation-number-cell">

\(1\)

      </td>
    </tr>
  </table>
</div>
```

Pandoc parses the Markdown math inside the raw HTML table. The target remains
the outer `Div`; the equation and number are adjacent cells in one row, and
KaTeX renders no native tag.

### EPUB

The current EPUB writer uses MathML and emits no native environment number. Yi
still receives the lowered unnumbered body, so a package that switches its math
method to KaTeX or MathJax behaves identically. A labeled equation gets the same
ID-bearing one-row, two-cell layout: formula first, number `(1)` second.

### DOCX and ODT

The math body is lowered before Pandoc converts it to OMML or a StarMath formula
object. A labeled block is wrapped in an ID-bearing `Div`, which becomes a Word
bookmark or ODT named section. Inside it is a native one-row grid table: the
formula is in the first cell and the visible number `(1)` is in the second.

### LaTeX and PDF

An unlabeled block receives the unnumbered body. A labeled block receives one
outer `equation` with `\label`, as shown above.

Packages must not add separate equation counters for a labeled block. A
template-owned `\theequation` remains authoritative for LaTeX/PDF references.
An automatic reference becomes:

```latex
\yiEquationRef{eq:energy}
```

with:

```latex
\providecommand{\yiEquationRef}[1]{%
  \hyperref[#1]{\equationname~\eqref{#1}}%
}
```

Manual links remain ordinary `\hyperref` links.

### Processed Markdown

Processed Markdown emits HTML containing MathML generated by KaTeX and one
visible number:

```html
<div id="eq:energy" class="equation-target">
  <span class="math display">…MathML…</span>
  <span class="equation-number">(1)</span>
</div>
```

The source formula is escaped in a code-data attribute or `<annotation>` so it
can be inspected, but it is not reparsed as a Yi equation.

### Explicit `\tag`

`\tag{…}` is author-provided math content. It is outside automatic equation
numbering in this release. The editor and exporters lower only environment
numbering; they do not rewrite explicit tags.

## Errors and edge cases

- `$${#eq:id}` remains ordinary math; it is not a target.
- A malformed `[$$…$$]{}` wrapper remains ordinary Markdown.
- Two blank lines inside the formula are valid math content.
- A block with text before or after its one top-level environment is not
  reinterpreted and receives no automatic environment lowering.
- An equation without an ID has no target and no Yi number.
- A targeted equation nested in a list or blockquote is outside this release.
- A `\tag` does not create or change a Yi target.
- A duplicate equation ID resolves to the first target.
- A template that defines its own equation counter must map it to the outer
  labeled equation rather than to inner rows.

## Tests

Pure checks cover:

- labeled wrapper recognition and exact source serialization;
- all matrix rows;
- environment analysis and starred lowering;
- plain-to-`equation` generation;
- `align`→`aligned`, `gather`→`gathered`, and `alignat`→`alignedat`;
- label/prefix formatting;
- only labeled equations entering the index;
- HTML/EPUB/DOCX/ODT/Processed Markdown lowering;
- LaTeX outer equation and `\yiEquationRef`;
- generated MathML fallback;
- malformed wrappers and `$${#id}`.

Tauri probes cover:

- typed `[$$` autocomplete and caret placement;
- plain and labeled equation rendering;
- suppressed environment tags in the editor;
- command-click navigation;
- automatic-reference text and renumbering;
- source reveal and editing;
- every environment × ID case in the default fixture;
- live insertion and removal changing later equation numbers.

Export probes cover every matrix row for:

- HTML;
- EPUB;
- DOCX;
- ODT;
- Processed Markdown;
- LaTeX;
- PDF;
- a template-owned `\theequation`.

## Documentation and fixture

The English Documentation explains:

- ordinary versus labeled display math;
- the `[$$…$$]{…}` syntax;
- the full environment × ID matrix;
- why native numbers are suppressed;
- one target per block and no row-level targets;
- automatic versus manual references;
- label and prefix frontmatter;
- editor source editing and navigation;
- every export behavior;
- `\tag` limitations and template counter rules.

The default Markdown fixture includes:

- plain formula without ID;
- plain formula with ID;
- unlabeled `equation`, `align`, `gather`, and `alignat`;
- labeled variants of every top-level family;
- star and inner variants;
- automatic and manual references;
- configured equation label and prefix.

## Out of scope

- per-row labels and references;
- automatic IDs for unlabeled equations;
- multiple top-level environments in one target;
- equations nested in lists or blockquotes;
- cross-document equation references;
- plural or range references;
- rewriting explicit `\tag` values into Yi numbering.
