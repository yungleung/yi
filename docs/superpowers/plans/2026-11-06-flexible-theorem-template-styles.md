# Flexible Theorem Kinds and Template Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink Yi's implicit theorem vocabulary to Theorem and proof, let notes declare additional kinds, and let templates supply custom `amsthm` styles either inline or from a separate package file.

**Architecture:** Yi remains the owner of theorem environments, counters and Pandoc-compatible declarations. Templates own visual styles and wrap Yi's capital-letter environments with presentation hooks. Custom styles generated from note metadata are guarded so a style already defined by the template remains authoritative.

**Tech Stack:** TypeScript, YAML, unified/remark, Pandoc 3.12, Lua filters, LaTeX/amsthm, Tauri probes, Node checks.

**Spec:** `docs/superpowers/specs/2026-11-06-flexible-theorem-template-styles-design.md`

## Global Constraints

- Only `Theorem` and `proof` are built-in theorem kinds.
- Every other kind is declared under `amsthm` in the note's frontmatter.
- Yi owns `\newtheorem`, counters, `\theoremstyle` selection and proof configuration.
- A template may provide named styles inline or in a separate `.sty` file.
- Yi emits a guarded fallback for custom styles and must not replace a style already defined by the template.
- Templates must not define the generated capital-letter environments directly.
- `[#id]` remains the only theorem-reference syntax.
- Custom classes remain case-sensitive ASCII identifiers.
- No template manifest field is required for theorem styles.
- Never commit to `main` or merge the feature branch without an explicit request.
- Restart `npm run tauri dev` after moving the branch beneath a running app.
- Run app checks through `npm run probe`, never by inspecting DOM internals in Node.

---

### Task 1: Reduce the built-in theorem vocabulary

**Files:**
- Modify: `src/ui/markdown/syntax/theorem/model.ts`
- Modify: `test/checks/check-theorem-vocabulary.mjs`
- Modify: `test/checks/check-reference-index.mjs`
- Modify: `test/checks/check-export.mjs`
- Test: `test/checks/check-theorem-parser.mjs`

**Interfaces:**
- Consumes: `DEFAULT_THEOREM_VOCABULARY` and `theoremVocabularyFromFrontmatter`.
- Produces: a default vocabulary whose classes are exactly `Theorem` and `proof`; no API shape changes.

- [ ] **Step 1: Replace the default-vocabulary expectations with failing tests**

In `test/checks/check-theorem-vocabulary.mjs`, replace the first default checks with:

```js
const defaults = theoremVocabularyFromFrontmatter(null);
check(
  'only Theorem and proof are built in',
  defaults.types.map((entry) => entry.className),
  ['Theorem', 'proof']
);
check(
  'the default Theorem is numbered',
  [type(defaults, 'Theorem')?.style, type(defaults, 'Theorem')?.numbered],
  ['plain', true]
);
check(
  'proof is predefined and unnumbered',
  [type(defaults, 'proof')?.style, type(defaults, 'proof')?.numbered],
  ['proof', false]
);
check('Lemma requires a declaration', type(defaults, 'Lemma'), null);
check('Definition requires a declaration', type(defaults, 'Definition'), null);
```

Change the `theoremDiv` class-change check to use the already-declared `custom`
vocabulary instead of `defaults`:

```js
check(
  'changing the theorem edits only the class token',
  theoremKindEdit(theoremDiv, 'Lemma', custom),
  {
    from: 17,
    to: 24,
    replacement: 'Lemma'
  }
);
```

In `test/checks/check-reference-index.mjs`, add explicit declarations to the
`theoremSource` frontmatter:

```yaml
amsthm:
  plain:
    - Theorem:
        - Lemma
  name_to_text:
    Theorem: 定理
    Lemma: 引理
```

In `test/checks/check-export.mjs`, make the materialized default metadata prove
that only Theorem is added:

```js
check(
  'a theorem export gains only the app-owned Theorem declaration',
  {
    header: preparedTheorem?.startsWith('---\namsthm:\n  plain:') ?? false,
    theorem: preparedTheorem?.includes('Theorem') ?? false,
    lemma: preparedTheorem?.includes('Lemma') ?? false,
    source: preparedTheorem?.includes(theoremMetadata) ?? false
  },
  { header: true, theorem: true, lemma: false, source: true }
);
```

Change the localized theorem assertion to require only Theorem and not Lemma:

```js
preparedLocalized.startsWith('---\ntitle: A theorem\namsthm:') &&
  preparedLocalized.includes('Theorem: 定理') &&
  !preparedLocalized.includes('Lemma') &&
  preparedLocalized.includes('::: {#thm:local .Theorem}')
```

- [ ] **Step 2: Run the focused checks and verify the failures name the extra defaults**

Run:

```bash
node test/checks/check-theorem-vocabulary.mjs
node test/checks/check-reference-index.mjs
node test/checks/check-export.mjs
```

Expected: failures show Lemma and the other former defaults still present.

- [ ] **Step 3: Leave only Theorem and proof in `DEFAULT_DECLARATIONS`**

`src/ui/markdown/syntax/theorem/model.ts` must contain:

```ts
const DEFAULT_DECLARATIONS: readonly Declaration[] = [
  {
    sourceName: 'Theorem',
    className: 'Theorem',
    style: 'plain',
    sharedCounter: null,
    numbered: true
  },
  {
    sourceName: 'proof',
    className: 'proof',
    style: 'proof',
    sharedCounter: null,
    numbered: false
  }
];
```

Do not change `resolveVocabulary`, `theoremDeclaration` or the metadata parser.

- [ ] **Step 4: Add an explicit-kind parser regression**

In `test/checks/check-theorem-parser.mjs`, add:

```js
const declaredKinds = parseMarkdown([
  '---',
  'amsthm:',
  '  plain:',
  '    - Lemma',
  '  definition:',
  '    - Definition',
  '---',
  '',
  '::: {.Lemma}',
  'Lemma body.',
  ':::',
  '',
  '::: {.Definition}',
  'Definition body.',
  ':::'
].join('\n'));
check(
  'frontmatter declarations still create non-built-in kinds',
  nodeOf(declaredKinds, 'theorem').map((node) => node.theorem.type.className),
  ['Lemma', 'Definition']
);
```

- [ ] **Step 5: Run vocabulary, parser, reference and export checks**

Run:

```bash
node test/checks/check-theorem-vocabulary.mjs
node test/checks/check-theorem-parser.mjs
node test/checks/check-reference-index.mjs
node test/checks/check-export.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/markdown/syntax/theorem/model.ts \
  test/checks/check-theorem-vocabulary.mjs \
  test/checks/check-theorem-parser.mjs \
  test/checks/check-reference-index.mjs \
  test/checks/check-export.mjs
git commit -m "feat(theorems): require explicit kinds beyond theorem"
```

---

### Task 2: Preserve template-provided theorem styles

**Files:**
- Modify: `src/ui/export/reference/theorem_header.ts`
- Modify: `test/checks/check-reference-header.mjs`
- Create: `test/checks/check-theorem-template-style.mjs`
- Modify: `test/run-checks.mjs` only if checks are not discovered automatically

**Interfaces:**
- Consumes: `amsthm.styles` from the resolved note vocabulary.
- Produces: guarded `\newtheoremstyle` blocks and unguarded `\theoremstyle` plus `\newtheorem` declarations.

- [ ] **Step 1: Turn the custom-style header check red**

In `test/checks/check-reference-header.mjs`, replace the direct style assertion
with:

```js
check(
  'a custom style is a guarded fallback',
  customTheoremPreamble.includes('\\@ifundefined{th@margin}') &&
    customTheoremPreamble.indexOf('\\@ifundefined{th@margin}') <
      customTheoremPreamble.indexOf('\\newtheoremstyle{margin}'),
  true
);
```

Also require the environment to select that style:

```js
check(
  'the environment still selects the template-owned style',
  customTheoremPreamble.includes('\\theoremstyle{margin}') &&
    customTheoremPreamble.includes('\\newtheorem{Claim}{主张}[section]'),
  true
);
```

- [ ] **Step 2: Run the header check and verify the guard is absent**

Run:

```bash
node test/checks/check-reference-header.mjs
```

Expected: failure on `\@ifundefined{th@margin}`.

- [ ] **Step 3: Guard each custom fallback**

In `customStyles`:

```ts
const declaration =
  `\\newtheoremstyle{${name}}{${above}}{${below}}{${bodyfont}}` +
  `{${indent}}{${headfont}}{${headpunct}}{${headspace}}{}`;
lines.push(
  '\\makeatletter',
  `\\@ifundefined{th@${name}}{%`,
  `  ${declaration}`,
  '}{}',
  '\\makeatother'
);
```

Keep the later `\theoremstyle{...}` and `\newtheorem` emission unchanged.

- [ ] **Step 4: Add a real Pandoc/TeX integration check**

Create `test/checks/check-theorem-template-style.mjs`. The check must:

1. Bundle `src/ui/export/reference/theorem_header.ts`.
2. Build a note declaring:

```yaml
amsthm:
  styles:
    template-style:
      headfont: bold
  template-style:
    - Theorem
```

3. Build a minimal Pandoc template whose preamble defines the same style
   *before* `$header-includes$`:

```tex
\documentclass{article}
\usepackage{amsthm}
\makeatletter
\newtheoremstyle{template-style}{}{}{\normalfont}{}{%
  \color{red}\bfseries}{.}{ }{}%
\makeatother
$header-includes$
\begin{document}
$body$
\end{document}
```

4. Write the generated theorem header to a temporary `.tex` file.
5. Run Pandoc with the bundled `amsthm.lua`, that template, that header and a
   `.Theorem` Div.
6. Compile the generated `.tex` with `pdflatex`.
7. Require compilation success and require the `.tex` to contain the guard but
   compile without a duplicate-style error.

Skip the compile with a diagnostic line only when `pandoc` or `pdflatex` is
absent.

- [ ] **Step 5: Run the header and integration checks**

Run:

```bash
node test/checks/check-reference-header.mjs
node test/checks/check-theorem-template-style.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/export/reference/theorem_header.ts \
  test/checks/check-reference-header.mjs \
  test/checks/check-theorem-template-style.mjs
git commit -m "feat(theorems): preserve template style definitions"
```

---

### Task 3: Bring the Legrand package onto this branch

**Files:**
- Create: `.gitattributes`
- Create: `examples/templates/legrand-orange-book/`
- Modify: `examples/templates/README.md`
- Modify: `test/README.md`
- Modify: `test/checks/check-template-examples.mjs`
- Modify: `test/probes/template-examples.js`

**Interfaces:**
- Consumes: commit `a5104c6`, which contains the reviewed Legrand template package.
- Produces: the same package and test coverage on `codex/theorem-template-styles`.

- [ ] **Step 1: Copy the reviewed package without changing history**

Run:

```bash
git checkout a5104c6 -- examples/templates/legrand-orange-book
```

Create `.gitattributes` exactly as:

```gitattributes
*.docx binary
*.jpg binary
*.odt binary
*.pdf binary
```

- [ ] **Step 2: Port the package checks into the theorem branch**

Port the `legrand-orange-book` checks from commit `a5104c6` into the current
`test/checks/check-template-examples.mjs`, keeping this branch's theorem checks.
Port the Legrand import/export section into
`test/probes/template-examples.js`.

Update package counts from seven to eight in:

- `examples/templates/README.md`;
- `test/README.md`;
- `docs/ai-context.md`.

- [ ] **Step 3: Run the ported checks**

The running dev app still holds the previous branch's modules. Stop it and run
`npm run tauri dev` again, waiting for the bridge on port 9223.

Run:

```bash
node test/checks/check-template-examples.mjs
npm run probe -- test/probes/template-examples.js
```

Expected: the raw-LaTeX Legrand example still imports and exports.

- [ ] **Step 4: Commit**

```bash
git add .gitattributes examples/templates/legrand-orange-book \
  examples/templates/README.md test/README.md \
  test/checks/check-template-examples.mjs test/probes/template-examples.js
git commit -m "docs(templates): carry Legrand example into theorem work"
```

---

### Task 4: Move Legrand theorem presentation into a package file

**Files:**
- Create: `examples/templates/legrand-orange-book/theorem-styles.sty`
- Modify: `examples/templates/legrand-orange-book/template.tex`
- Modify: `examples/templates/legrand-orange-book/example.md`
- Modify: `examples/templates/legrand-orange-book/metadata.yaml`
- Modify: `examples/templates/legrand-orange-book/template.json`
- Modify: `examples/templates/legrand-orange-book/README.md`
- Modify: `examples/templates/legrand-orange-book/ATTRIBUTION.txt`
- Modify: `test/checks/check-template-examples.mjs`
- Modify: `test/probes/template-examples.js`

**Interfaces:**
- Consumes: `theoremHeader` guarded styles and Yi theorem Divs.
- Produces: Legrand style names `legrand-plain`, `legrand-definition` and `legrand-remark`.

- [ ] **Step 1: Make the package checks require the new contract**

In `test/checks/check-template-examples.mjs`, add `theorem-styles.sty` to the
required files and manifest assets. Replace the raw-LaTeX example checks with:

```js
/\\usepackage\{theorem-styles\}/.test(template) &&
  !/\\newenvironment\{theorem\}/.test(template) &&
  /::: \{\.Theorem\}/.test(example) &&
  /::: \{\.Definition\}/.test(example) &&
  /::: \{\.Remark\}/.test(example) &&
  /legrand-plain/.test(example) &&
  /legrand-definition/.test(example) &&
  /legrand-remark/.test(example)
```

Require the style file to define `legrand-plain`, `legrand-definition` and
`legrand-remark`, and to attach hooks to `Theorem`, `Definition`, `Corollary`,
`Exercise` and `Remark`.

In `test/probes/template-examples.js`, after loading the example:

```js
check(
  'Legrand theorem Divs render as semantic theorem blocks',
  ['Theorem', 'Definition', 'Remark'].every((name) =>
    visible.includes(name)
  ) && !visible.includes(':::')
);
```

Require the exported PDF to contain the theorem title and definition text.

- [ ] **Step 2: Run checks and verify the raw-LaTeX package fails**

Run:

```bash
node test/checks/check-template-examples.mjs
```

Expected: failure naming the missing `theorem-styles.sty` and raw theorem
environments.

- [ ] **Step 3: Extract the Legrand style file**

Create `theorem-styles.sty` with:

```tex
\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{theorem-styles}[2026/11/06 Legrand theorem styles]
\RequirePackage{amsthm}
\RequirePackage{etoolbox}
\RequirePackage[framemethod=default]{mdframed}
\RequirePackage{xcolor}
\providecolor{ocre}{RGB}{243,102,25}

\newmdenv[
  skipabove=7pt,skipbelow=7pt,backgroundcolor=black!5,
  linecolor=ocre,innerleftmargin=5pt,innerrightmargin=5pt,
  innertopmargin=5pt,innerbottommargin=5pt,
  leftmargin=0cm,rightmargin=0cm
]{LegrandTheoremBox}

\newmdenv[
  skipabove=7pt,skipbelow=7pt,rightline=false,leftline=true,
  topline=false,bottomline=false,backgroundcolor=ocre!10,
  linecolor=ocre,innerleftmargin=5pt,innerrightmargin=5pt,
  innertopmargin=5pt,innerbottommargin=5pt,
  leftmargin=0cm,rightmargin=0cm,linewidth=4pt
]{LegrandExerciseBox}

\newmdenv[
  skipabove=7pt,skipbelow=7pt,rightline=false,leftline=true,
  topline=false,bottomline=false,linecolor=ocre,
  innerleftmargin=5pt,innerrightmargin=5pt,innertopmargin=0pt,
  innerbottommargin=0pt,leftmargin=0cm,rightmargin=0cm,linewidth=4pt
]{LegrandDefinitionBox}

\newmdenv[
  skipabove=7pt,skipbelow=7pt,rightline=false,leftline=true,
  topline=false,bottomline=false,linecolor=gray,
  backgroundcolor=black!5,innerleftmargin=5pt,innerrightmargin=5pt,
  innertopmargin=5pt,innerbottommargin=5pt,
  leftmargin=0cm,rightmargin=0cm,linewidth=4pt
]{LegrandCorollaryBox}

\newenvironment{LegrandRemark}
  {\par\vspace{10pt}\small\begin{list}{}{\leftmargin=35pt\rightmargin=25pt}\item\ignorespaces}
  {\end{list}\vskip5pt}

\makeatletter
\newtheoremstyle{legrand-plain}
  {0pt}{0pt}{\normalfont}{}%
  {\small\bfseries\sffamily\color{ocre}}{\;}{0.25em}%
  {\small\sffamily\color{ocre}\thmname{#1}%
   \nobreakspace\thmnumber{\@upn{#2}}%
   \thmnote{\nobreakspace\bfseries\color{black}---\nobreakspace#3.}}

\newtheoremstyle{legrand-definition}
  {5pt}{5pt}{\normalfont}{}%
  {\small\bfseries\sffamily}{\;}{0.25em}%
  {\small\sffamily\thmname{#1}\nobreakspace\thmnumber{\@upn{#2}}%
   \thmnote{\nobreakspace\bfseries---\nobreakspace#3.}}

\newtheoremstyle{legrand-remark}
  {10pt}{5pt}{\small\normalfont}{35pt}%
  {\small\bfseries\sffamily\color{ocre}}{\;}{0.25em}%
  {\small\sffamily\color{ocre}\thmname{#1}%
   \nobreakspace\thmnumber{\@upn{#2}}%
   \thmnote{\nobreakspace\bfseries\color{black}---\nobreakspace#3.}}
\makeatother

\BeforeBeginEnvironment{Theorem}{\begin{LegrandTheoremBox}}
\AfterEndEnvironment{Theorem}{\end{LegrandTheoremBox}}
\BeforeBeginEnvironment{Definition}{\begin{LegrandDefinitionBox}}
\AfterEndEnvironment{Definition}{\end{LegrandDefinitionBox}}
\BeforeBeginEnvironment{Corollary}{\begin{LegrandCorollaryBox}}
\AfterEndEnvironment{Corollary}{\end{LegrandCorollaryBox}}
\BeforeBeginEnvironment{Exercise}{\begin{LegrandExerciseBox}}
\AfterEndEnvironment{Exercise}{\end{LegrandExerciseBox}}
\BeforeBeginEnvironment{Remark}{\begin{LegrandRemark}}
\AfterEndEnvironment{Remark}{\end{LegrandRemark}}
```

Use `etoolbox` hooks, not `\newenvironment{Theorem}`.

- [ ] **Step 4: Remove the old theorem presentation from `template.tex`**

Delete the upstream theorem-style declarations and lowercase theorem/definition/
corollary/exercise/example wrappers from `template.tex`. Keep general packages
such as `amsmath`, `amsfonts` and `amssymb`.

Add immediately before `$header-includes$`:

```tex
\usepackage{theorem-styles}

$if(header-includes)$
$header-includes$
$endif$
```

- [ ] **Step 5: Convert the example and metadata to theorem Divs**

In both `metadata.yaml` and `example.md`, declare:

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
    - Exercise
    - Problem
    - Vocabulary
  legrand-remark:
    - Notation
    - Remark
  name_to_text:
    proof: Proof
```

Replace each raw theorem-shaped environment with a complete Yi Div. For
example:

```markdown
::: {.Theorem info="Completeness of the visual hierarchy"}
Every distinction in the argument should have exactly one visible level, and
that level should remain consistent throughout the book.
:::
```

Use `.Definition`, `.Remark`, `.Corollary`, `.Proposition`, `.Example`,
`.Exercise`, `.Problem` and `.Vocabulary` similarly. Keep `::: proof` for the
proof block if one is added.

- [ ] **Step 6: Update the manifest and package guide**

Add `theorem-styles.sty` to `template.json` assets and to the README file tree.

Document these style names and the guarded-fallback rule. Include a copy-ready
custom-kind snippet showing `styles.<name>: {}` plus the style group.

- [ ] **Step 7: Run the package check and app probe**

Run:

```bash
node test/checks/check-template-examples.mjs
npm run probe -- test/probes/template-examples.js
```

Expected: both pass, and the complete Legrand PDF compiles with theorem Divs.

- [ ] **Step 8: Commit**

```bash
git add examples/templates/legrand-orange-book \
  test/checks/check-template-examples.mjs \
  test/probes/template-examples.js
git commit -m "feat(templates): use Yi theorem environments in Legrand"
```

---

### Task 5: Document user-defined kinds and template styles

**Files:**
- Modify: `src/ui/documentation/en.md`
- Modify: `src/ui/documentation/de.md`
- Modify: `src/ui/documentation/es.md`
- Modify: `src/ui/documentation/fr.md`
- Modify: `src/ui/documentation/ja.md`
- Modify: `src/ui/documentation/pt.md`
- Modify: `src/ui/documentation/zh-Hans.md`
- Modify: `src/ui/documentation/zh-Hant.md`
- Modify: `docs/ai-context.md`
- Modify: `docs/architecture.md`
- Modify: `test/checks/check-documentation.mjs`
- Modify: `test/README.md`

**Interfaces:**
- Consumes: the final Theorem/proof vocabulary and guarded style contract.
- Produces: reader-facing instructions for custom kinds and template styles.

- [ ] **Step 1: Add failing documentation checks**

In `test/checks/check-documentation.mjs`, require:

```js
/only Theorem and proof are built in/i.test(text) &&
  /styles:\\n    my-definition/.test(text) &&
  /\\@ifundefined\\{th@/i.test(text) &&
  /separate \\.sty file/i.test(text) &&
  /template.*style.*before \\$header-includes\\$/i.test(text)
```

Also require the Legrand README to name `legrand-plain`,
`legrand-definition`, `legrand-remark` and `theorem-styles.sty`.

- [ ] **Step 2: Run documentation checks and verify the missing instructions fail**

Run:

```bash
node test/checks/check-documentation.mjs
```

Expected: failure naming the missing built-in and style-contract guidance.

- [ ] **Step 3: Rewrite the English theorem section around user ownership**

In `src/ui/documentation/en.md`:

- State that only Theorem and proof are built in.
- Show a frontmatter example that declares Definition, Assumption and Axiom.
- Show a matching `.Axiom` Div and `[#ax:choice]` reference.
- Explain `styles.<name>: {}` as the note-side request for a named template
  style and as the fallback descriptor when the template does not provide one.
- State that a template may define the style inline or in a separate `.sty`
  file, before `$header-includes$`.
- Explain that Yi guards fallback definitions, so existing template styles win.
- State that templates must not define Yi's capital-letter environments
  directly and should use hooks instead.

Use this complete example:

```yaml
amsthm:
  styles:
    course-definition: {}
  course-definition:
    - Definition
    - Assumption
    - Axiom
  name_to_text:
    Definition: Definition
    Assumption: Assumption
    Axiom: Axiom
```

```markdown
::: {#ax:choice .Axiom info="Choice"}
Every vector space has a basis.
:::

See [#ax:choice].
```

- [ ] **Step 4: Update translated package summaries**

Keep the localized guides concise, but make each state that only Theorem and
proof are built in and other kinds are declared in note frontmatter. Update
their Legrand bullets to mention the external `theorem-styles.sty`.

- [ ] **Step 5: Update architecture and agent context**

In `docs/ai-context.md` and `docs/architecture.md`:

- Name `ui/export/reference/theorem_header.ts` as the environment owner.
- Name template `.sty` files as style owners.
- Document the guarded `th@<style>` fallback.
- State that templates must not define capital theorem environments.

- [ ] **Step 6: Run documentation and layout checks**

Run:

```bash
node test/checks/check-documentation.mjs
node test/checks/module-layout.mjs
node test/checks/headers.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/documentation docs/ai-context.md docs/architecture.md \
  test/checks/check-documentation.mjs test/README.md
git commit -m "docs(theorems): explain user-defined kinds and styles"
```

---

### Task 6: Prove the complete feature in the app and PDF

**Files:**
- Modify: `test/probes/div-kind-picker.js`
- Modify: `test/probes/theorem-blocks.js`
- Modify: `test/probes/theorem-default-document.js`
- Modify: `test/probes/export-pdf.js`
- Modify: `test/probes/export-latex.js`
- Modify: `test/probes/template-examples.js`

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: end-to-end proof that custom kinds appear, export and use a template style.

- [ ] **Step 1: Extend the picker probe**

Add a second note:

```markdown
---
amsthm:
  styles:
    custom-plain: {}
  custom-plain:
    - Axiom
---

:::
```

Assert that `theorem:Axiom` appears and that selecting it writes `.Axiom`.

- [ ] **Step 2: Extend the theorem probe**

Load a note declaring:

```yaml
amsthm:
  styles:
    custom-definition: {}
  custom-definition:
    - Definition
    - Axiom
```

Assert:

- the `Axiom` body and reference render;
- closing the fence reclassifies an existing Div;
- removing the declaration returns it to exact source.

- [ ] **Step 3: Extend PDF and LaTeX probes**

Add one explicitly declared custom kind to each export fixture:

```markdown
---
amsthm:
  styles:
    custom-definition: {}
  custom-definition:
    - Definition
---

::: {#def:pdf .Definition}
A declared definition reaches the PDF.
:::
```

Assert the native output contains the generated `Definition` environment and
resolved reference.

- [ ] **Step 4: Extend the Legrand app probe**

Require the exported Legrand PDF to contain:

- `Theorem`;
- the theorem note;
- `Definition`;
- `Remark`;
- the explicit references chapter;
- no raw `:::` text;
- no index.

- [ ] **Step 5: Restart the app on the final branch**

Stop the existing Tauri development process and run:

```bash
npm run tauri dev
```

Run the probes only after the restarted app answers the bridge.

- [ ] **Step 6: Run focused app probes**

Run:

```bash
npm run probe -- test/probes/div-kind-picker.js
npm run probe -- test/probes/theorem-blocks.js
npm run probe -- --with-workspace --fixture default-document.md test/probes/theorem-default-document.js
npm run probe -- test/probes/export-pdf.js
npm run probe -- test/probes/export-latex.js
npm run probe -- test/probes/template-examples.js
```

Expected: all pass. A long probe may be recovered from its stash after the
five-second bridge timeout; it still counts only when the final result says no
checks failed.

- [ ] **Step 7: Run the complete required verification**

Run:

```bash
npx tsc --noEmit
cargo test
npm run check
npm run probe:all
```

Expected: every command exits zero; only probes whose declared dependencies are
unavailable may skip.

- [ ] **Step 8: Commit**

```bash
git add test/probes
git commit -m "test(theorems): prove custom kinds and template styles"
```

## Completion Criteria

- The only implicit theorem kinds are Theorem and proof.
- All other kinds require an `amsthm` declaration and are rejected otherwise.
- Template styles may live inline or in a `.sty` file.
- Yi's fallback style is guarded and does not replace a template style.
- Legrand uses Yi theorem Divs and `theorem-styles.sty`.
- Reader documentation includes a copy-ready custom kind and style example.
- The focused checks, app probes, TypeScript, Rust tests and full probe suite
  pass on the final tree.
