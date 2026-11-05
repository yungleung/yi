# Theorem Blocks and Pandoc-amsthm Compatibility

**Date:** 2026-11-05

**Status:** Proposed for review

## Goal

Add first-class theorem, definition, remark, and proof containers built on Pandoc fenced Divs. Authors
use Yi's existing automatic-reference syntax, `[#id]`, and do not need to learn Pandoc citation
syntax. Pandoc-backed exports use the upstream `pandoc-amsthm` Lua filter, while the editor renders
and edits the same blocks without running Pandoc.

The feature must preserve the document text as the only source of truth. Adding a declaration in
frontmatter may change how an existing complete Div is classified, but no theorem construct may
rewrite source merely by being viewed.

## Example

```markdown
---
amsthm:
  plain:
    - Theorem:
        - Lemma
        - Corollary
    - Proposition
  definition:
    - Definition
    - Example
  remark:
    - Remark
  name_to_text:
    Theorem: 定理
    Lemma: 引理
    proof: 证明
---

::: {#thm:bayes .Theorem info="Bayes"}
For events \(A\) and \(B\) with \(P(B)>0\),
$$
  P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}.
$$
:::

See [#thm:bayes].
```

The document renders a numbered theorem headed `定理 1 (Bayes)`. The visible reference is
`定理 1`. A Pandoc-backed export temporarily serializes that reference as `@Thm:bayes`, which the
upstream filter resolves to the same named reference.

## User Contract

### Built-in theorem declarations

Yi supplies these declarations when a note has no corresponding `amsthm` metadata:

```yaml
amsthm:
  plain:
    - Theorem:
        - Lemma
        - Corollary
    - Proposition
  definition:
    - Definition
    - Example
    - Exercise
    - Problem
    - Vocabulary
  remark:
    - Notation
    - Remark
```

`proof` is always available and unnumbered.

Built-in declarations are app defaults, not metadata copied into every note. A note may override
display titles with `name_to_text` and may add new theorem types through the same `amsthm` structure.
The export adapter materializes the merged declarations in the temporary source handed to Pandoc.

Resolution starts from the built-in declarations, then applies the note's declarations:

- a newly named type is added;
- a built-in type repeated under an explicit style replaces that default declaration;
- nested names add counter sharing as they do upstream;
- `name_to_text` merges by exact class name;
- other `pandoc-amsthm` options are taken from the note and otherwise keep their upstream defaults.

Built-in types cannot be removed in this version. A class declared more than once is ambiguous and is
not classified or offered by the picker. Custom class names are safe ASCII identifiers beginning with
a letter; localized text belongs in `name_to_text`.

### Fenced Div syntax

Theorem classes keep the exact, case-sensitive spelling declared in metadata:

```markdown
::: {#claim:compactness .Claim info="Compactness"}
The assertion.
:::
```

- The class selects the theorem type.
- `info=` is the theorem note shown in parentheses and may contain Markdown.
- The opening Div ID is optional and is the target for `[#id]`.
- The body accepts every ordinary Markdown block supported inside a fenced Div.
- `proof` remains the predefined unnumbered proof environment.

An unknown class remains an ordinary fenced Div and is shown as exact source. It is never guessed to
be a theorem from its spelling.

### Metadata dependency

Structural Div parsing is independent of frontmatter: a balanced colon fence is still one complete
Div even when its class is unknown. Semantic classification uses a theorem vocabulary resolved from
the app defaults and the document's YAML frontmatter.

The document state must therefore reclassify affected Divs when frontmatter changes. Adding a
declaration changes a matching Div from exact source to a theorem; removing the declaration returns
it to exact source. Neither operation changes the Div's bytes.

The theorem vocabulary reader is the only reader of `amsthm` metadata. The same resolved vocabulary
feeds block classification, rendering, numbering, the Div-kind picker, automatic references, and
export preparation.

### The `pandoc-amsthm` options

The default path uses the upstream metadata contract and preserves its options for export:

- `plain`, `definition`, and `remark` style groups;
- nested declarations that share the parent theorem's counter;
- a trailing `*` on a declaration for an unnumbered type;
- `name_to_text`;
- `parent_counter`, `counter_depth`, and `counter_ignore_headings`;
- `swapnumbers`, `qed_symbol`, and `css`;
- custom theorem styles under `styles`.

The editor supports the numbering effects of `parent_counter`, `counter_depth`, and
`counter_ignore_headings`; the LaTeX-only spacing details of custom styles remain export concerns.
Every option is preserved in the temporary export metadata even where the editor has no visual
equivalent.

## Architecture

### Theorem syntax domain

Add `src/ui/markdown/syntax/theorem/` with one public `index.ts`:

| File | Responsibility |
| --- | --- |
| `model.ts` | Theorem values, app defaults, style/counter types, declaration validation |
| `vocabulary.ts` | YAML frontmatter reader and resolved vocabulary |
| `reader.ts` | Classify one complete fenced Div from the shared container ranges |
| `parser_source.ts` | Offset-preserving preparation for the remark theorem node |

The domain may import the shared Pandoc attribute grammar, the generic fenced-Div reader, the YAML
parser, and mdast types. It may not import DOM, document state, rendering, commands, or Tauri.

It must not re-read colon fences or duplicate Markdown containment rules. `syntax/container/divs.ts`
remains the owner of structural Div ranges.

### Parser and AST

Add `plugins/remark-theorem.ts`, modelled on the callout normalizer. It converts only a Div classified
by the resolved theorem vocabulary into an `AstTheorem` node carrying:

- the theorem type and display title;
- the source Div ranges;
- the optional ID and theorem note;
- the parsed body children.

The parser source transform preserves every source character position, including nested quotes,
unknown Divs, code fences, and frontmatter.

A theorem body may contain ordinary blocks, lists, tables, equations, code, citations, links, and
nested callouts or theorems where the colon-fence lengths permit them.

### Rendering and editing

Add `nodes/theorem.ts` and register one `theorem` node. Outside source mode it renders:

- one semantic theorem surface with classes for the theorem type and style;
- one generated heading containing the visible type name, number, and optional parenthetical note;
- the parsed Markdown body;
- a proof marker and QED treatment for `proof`.

While the caret is inside a theorem, the complete fenced-Div source is shown and edited exactly as
with a callout. Clicking the rendered type heading or body enters that source. Enter, nested fences,
lists, tables, equations, completion, bracket pairing, and paste follow the existing fenced-Div rules.

The live renderer must render typed Unicode labels such as `定理 1` without depending on the app's
interface locale. The note's metadata owns those words.

### Reference targets

Extend the document reference index with theorem entries. Each theorem block consumes its declared
counter even when it has no ID. Only an ID-bearing theorem is referenceable.

All reference dispatch is by resolved target kind, never by ID prefix:

```text
[#euler]      target.kind === theorem   -> theorem reference
[#fig:model]  target.kind === figure    -> existing figure reference
[#missing]    unresolved                -> existing unresolved behavior
```

`thm:`, `lem:`, or other prefixes remain optional authoring conventions. Changing a block from
`.Theorem` to `.Lemma` does not require renaming its ID or references.

Theorem reference display uses the resolved display title and number, for example `Theorem 1` or
`定理 1`. The source stays `[#id]`; capitalization in the ID is not an author-facing convention.

### Grouped Div-kind picker

Replace the callout-only choice list with a generic grouped Div-kind picker. Its choices are supplied
by the editor from current document state:

```text
Default

Callout
  Note
  Tip
  Important
  Warning
  Caution
  Definition

Theorem
  Theorem
  Lemma
  Corollary
  Proposition
  Definition
  Conjecture        (only when declared by the note)
```

Choice identifiers are namespaced internally:

```text
default
callout:note
callout:definition
theorem:Theorem
theorem:Definition
```

The visible labels do not say `amsthm`. Group headings distinguish otherwise identical labels such
as Definition. Group headings are not selectable; arrow navigation skips them. The card scrolls when
the declaration set exceeds the available height.

Selecting a theorem choice writes only `{.ClassName}` (and leaves other attributes alone when
changing an existing Div). Selecting a callout choice uses the existing callout class edit.

Valid custom theorem declarations appear in the picker immediately after the frontmatter edit. Invalid
or duplicate declarations do not add ambiguous choices.

## Export

### Filter integration

Vendor a pinned release of `amsthm.lua` from `ickc/pandoc-amsthm`, retain its BSD-3-Clause licence,
and pass the local file to every Pandoc-backed export. Yi must not fetch the filter at export time.

The filter must run before citeproc so it resolves generated `@Id` theorem references before ordinary
citations are processed. Pandoc 3.1.1 or later is the supported minimum for theorem export; a missing
or older Pandoc produces a localized, actionable failure.

The bundled processed-Markdown export does not run Pandoc. It writes theorem references as ordinary
visible Markdown links rather than leaking `@Id` citation syntax into its output.

### Temporary reference serialization

Only the text handed to Pandoc contains the filter's citation-like references:

```text
[#thm:euler] -> @Thm:euler  -> named theorem reference
```

The first character is capitalized only in the temporary token. The stored ID is unchanged.
Theorem IDs must begin with a lowercase ASCII letter so the upstream filter can map `@Id` back to
`id`; an invalid theorem ID remains exact source and is reported before export.

`@id` and `[@id]` remain citations in Yi's source language. Importing a document written in
upstream amsthm citation syntax is a separate migration feature; it is not silently reinterpreted.

Theorem IDs and bibliography citation keys must not collide. If they do, export stops with a
localized collision error naming both, rather than letting the filter reinterpret a citation.

## Failure Behavior

- A malformed theorem declaration does not disable unrelated declarations or theorem blocks.
- A duplicate class declaration is reported and omitted from the picker until resolved.
- An unclosed or malformed fenced Div remains ordinary source.
- An undeclared class remains exact source.
- Missing or older Pandoc does not alter the note and reports the version requirement.
- A theorem ID without a lowercase ASCII first character remains exact source and is marked invalid
  for export.
- A reference to an unnumbered theorem remains visible but unresolved, matching the upstream filter's
  warning rather than inventing a number.
- Removing theorem metadata never removes source content; affected Divs return to exact-source mode.

## Tests

### Node checks

- Theorem vocabulary: defaults, sparse overrides, custom types, localized titles, nested shared
  counters, unnumbered declarations, malformed YAML, duplicate declarations, and fallback isolation.
- Theorem reader: complete and nested Divs, quote carriers, `info`, IDs, unknown classes, and exact
  source ranges.
- Reference index: theorem numbering and targets, no-ID blocks consuming counters, shared counters,
  display labels, duplicate first-match behavior, and references before their target.
- Export preparation: `[#id]` to `@Id`, preservation of citations, Markdown-export links, materialized
  default metadata, BSD filter path, and filter-before-citeproc ordering.
- Div picker model: grouped choices, namespaced values, custom declarations, invalid declarations,
  and the callout Definition/theorem Definition distinction.

Every new behavior starts with a failing check that is watched fail before implementation.

### Tauri probes

- Built-in theorem renders with the expected label and body.
- Localized `name_to_text` renders `定理 1` and `[#id]` displays the same phrase.
- Adding a custom declaration reclassifies an existing `.Claim` Div without changing its bytes.
- Removing the declaration returns the same bytes to exact-source mode.
- Unknown and malformed declarations remain exact source.
- The grouped picker shows callouts and theorems separately, includes valid custom types, skips
  group headings with the keyboard, and writes the correct source.
- Editing inside a theorem, leaving it, and re-entering it preserve caret and source.
- A theorem containing lists, tables, equations, code, citations, and a nested callout remains
  editable and navigable.
- With a fake Pandoc, theorem exports receive the bundled filter before citeproc and the temporary
  `@Id` reference.

### Final verification

Run `npx tsc --noEmit`, `cargo test`, `npm run check`, the affected probes, and the full
`npm run probe:all` before the branch is ready for review. If Pandoc is available, run one real
HTML and one real PDF export through the vendored filter.

## Non-goals

- Parsing raw `\begin{theorem}` environments or `\newtheorem` declarations from note bodies.
- Treating every unknown Div as a theorem.
- Introducing a second theorem-reference syntax beside `[#id]`.
- Making the app's interface language control theorem titles.
- Automatically rewriting imported upstream `@id` references.
- General-purpose rendering of unrelated Pandoc Div classes.

## Acceptance Criteria

1. A note can author theorem-like blocks with Pandoc-compatible metadata and fenced Divs without
   learning amsthm citation syntax.
2. Built-in and custom theorem types render, number, edit, and appear in the grouped Div-kind picker.
3. `[#id]` resolves automatically by block kind and never changes the source syntax.
4. Pandoc-backed exports use the pinned upstream filter and produce native amsthm output; processed
   Markdown remains ordinary Markdown.
5. Metadata edits reclassify blocks and invalidate the relevant caches without losing content.
6. The focused checks, type check, Rust tests, and affected Tauri probes pass.
