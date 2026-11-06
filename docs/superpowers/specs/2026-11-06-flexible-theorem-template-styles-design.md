# Flexible Theorem Kinds and Template Styles

**Date:** 2026-11-06

**Status:** Implemented

## Goal

Make theorem kinds and visual styles explicit user choices. Yi continues to own
LaTeX environment declarations, counters and Pandoc compatibility, while a
template owns presentation through named `amsthm` styles. Built-in theorem
kinds shrink to the smallest useful vocabulary.

## User Contract

### Minimal built-ins

Yi ships only:

- `Theorem`, a numbered `plain` kind;
- `proof`, an unnumbered environment with QED behavior.

Every other kind, including Lemma, Corollary, Proposition, Definition, Example,
Exercise, Problem, Vocabulary, Notation and Remark, must be declared under
`amsthm` in the note's frontmatter.

This is a deliberate compatibility boundary. The theorem feature is not yet
merged, so there are no existing documents whose implicit use of the larger
default vocabulary must be retained.

Example:

```yaml
amsthm:
  styles:
    legrand-plain: {}
    legrand-definition: {}
    legrand-remark: {}
  legrand-plain:
    - Theorem:
        - Lemma
        - Corollary
    - Proposition
  legrand-definition:
    - Definition
    - Example
  legrand-remark:
    - Remark
  name_to_text:
    Theorem: Theorem
    Lemma: Lemma
    Definition: Definition
```

Declared kinds feed the same vocabulary as built-ins. They appear in the
theorem picker, render with their declared display names and share counters
according to the existing nested-declaration rules.

### Template-owned styles

A template may define any named `amsthm` style before its
`$header-includes$` slot. The style may live in either:

- a separate package file, such as `theorem-styles.sty`, included by the
  template; or
- the template's own TeX preamble.

File location does not alter the contract.

Yi emits the note's environment declarations and uses the declared style:

```tex
\theoremstyle{legrand-plain}
\newtheorem{Theorem}{Theorem}
```

Yi also emits a guarded fallback definition for custom styles represented in
the note's `amsthm.styles` metadata. The fallback must not replace a style the
template already defined:

```tex
\makeatletter
\@ifundefined{th@legrand-plain}{%
  \newtheoremstyle{legrand-plain}...%
}{}
\makeatother
```

This lets a note remain readable in the editor and fall back to a plain
presentation without a matching template, while a matching template remains
authoritative.

Templates must not define the generated capital-letter environments directly.
They may attach presentation to them:

```tex
\BeforeBeginEnvironment{Theorem}{\begin{TheoremBox}}
\AfterEndEnvironment{Theorem}{\end{TheoremBox}}
```

The exact environment names remain the class names declared by the note.

### Introducing a new kind

The user declares a class under a style group:

```yaml
amsthm:
  styles:
    my-definition: {}
  my-definition:
    - Definition
    - Assumption
    - Axiom
```

The corresponding block is:

```markdown
::: {#ax:choice .Axiom info="Choice"}
Every vector space has a basis.
:::
```

No application code is required. Adding the declaration reclassifies existing
complete Divs, updates the picker, and makes theorem references resolve.

## Architecture

### Theorem vocabulary

`syntax/theorem/model.ts` keeps `Theorem` and `proof` in
`DEFAULT_DECLARATIONS`. The previous textbook-oriented defaults move into
documentation and template `metadata.yaml` examples, not application defaults.

The resolved vocabulary remains the single source for:

- parser classification;
- the Div-kind picker;
- editor titles and reference numbering;
- temporary Pandoc metadata;
- generated LaTeX environments.

### LaTeX header ownership

`ui/export/reference/theorem_header.ts` remains the owner of:

- `\usepackage{amsthm}`;
- custom-style fallbacks;
- `\swapnumbers`;
- proof name and QED settings;
- `\theoremstyle` selection;
- environment and counter declarations.

Custom style fallback definitions are individually guarded with
`\@ifundefined{th@<style>}`. Built-in `plain`, `definition` and `remark` styles
do not need guards because they are owned by `amsthm`.

Yi does not inspect whether a template style came from a separate package or
inline TeX. TeX's definition state is the authority.

### Environment collision policy

Yi owns environments named by theorem classes. A template that defines
`Theorem`, `Definition` or another declared class directly is outside the
contract and will produce the ordinary LaTeX duplicate-environment error.

Templates provide visual treatment through named theorem styles and
`BeforeBeginEnvironment` / `AfterEndEnvironment` hooks.

### Legrand Orange Book adaptation

Create `examples/templates/legrand-orange-book/theorem-styles.sty` with the
Legrand theorem presentation:

- named styles used by the example's theorem groups;
- orange heading treatment;
- `mdframed` containers for theorem, definition, corollary and exercise;
- the circled-R remark treatment;
- hooks attached to Yi's capital-letter environments.

`template.tex` includes the style file before `$header-includes$` and stops
defining the lowercase theorem environments used only by the original
upstream example.

The example note uses Yi theorem Divs rather than raw LaTeX theorem
environments. Its `metadata.yaml` declares every kind it demonstrates:

- Theorem, Lemma, Corollary and Proposition under a plain style;
- Definition, Example, Exercise, Problem and Vocabulary under a definition
  style;
- Notation and Remark under a remark style.

The manifest includes `theorem-styles.sty` as an asset.

## Documentation

Update the English theorem guide and translated template-package summaries to
explain:

- only Theorem and proof are built in;
- custom kinds are declared in frontmatter;
- custom styles may be inline or in a separate package file;
- the template must define styles before `$header-includes$`;
- template styles win over Yi's guarded fallback;
- templates must not define the generated capital-letter environments;
- template packages can seed their kinds in `metadata.yaml`.

Update the Legrand README with its style names and a copy-ready custom-kind
snippet.

## Failure Behavior

- A missing custom style uses Yi's guarded fallback.
- An invalid style name does not generate a fallback.
- A template that defines a generated environment directly fails with the
  TeX duplicate-definition error; Yi does not silently replace it.
- Removing a frontmatter declaration returns its Div to exact-source mode.
- Removing every non-built-in kind does not affect Theorem, proof or existing
  theorem references declared by the note.

## Tests

### Pure checks

- Default vocabulary contains only Theorem and proof.
- A document declares Definition, Lemma and custom kinds explicitly.
- Declared kinds add picker choices and theorem references.
- A template-provided custom style is not redefined by Yi.
- A custom style absent from the template gains the generated fallback.
- Environment declarations still use the declared style after either path.
- Legrand's theorem style file is a manifest asset and template.tex includes
  it before `header-includes`.

### Tauri and PDF probes

- The Legrand example's theorem Divs render with the template's orange
  presentation rather than Yi's default.
- Test PDF and full export compile through pdfLaTeX with the external style
  file.
- A note declaring a new kind appears in the picker and exports as the declared
  environment.
- A matching template style is used once; the fallback style is absent from the
  generated header at TeX evaluation time.

### Final verification

Run `npx tsc --noEmit`, `cargo test`, `npm run check`, the affected Tauri
probes, and the complete Legrand PDF export.

## Non-goals

- Parsing templates to discover style definitions.
- Requiring a template manifest field for theorem styles.
- Letting templates define duplicate capital-letter theorem environments.
- Keeping the former full default theorem taxonomy for compatibility.
- Automatically migrating unmerged branch documents that relied on the former
  defaults.
