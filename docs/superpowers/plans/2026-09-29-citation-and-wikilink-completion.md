# Citation and wikilink completion

**Goal:** the user's ask — `[` is always completed with `]` and the caret stays inside; typing `@`
offers the bibliography's keys, filtered by what is being typed (key *or* title), chosen with the
arrows (the selected entry showing its title) and written with Enter; and typing `[[` offers the
workspace's documents as `id — title` (title alone when a document has no id), chosen the same way,
with Enter writing the id.

The branch is `codex/completion`; the user reviews this plan before it is merged.

## What is already there

| Piece | Where it is | What it gives us |
| --- | --- | --- |
| Where a citation may start, and what a key may contain | `plugins/remark-citation/syntax.ts` | the rule is written down: a key starts with a letter, digit or `_` and continues with those plus pandoc's punctuation, and the `@` is **not** a citation after an alphanumeric or a backslash — which is exactly the condition the popup must open on, asked from the same place rather than re-spelled |
| How a wikilink is written | `plugins/remark-wikilink/syntax.ts` | `[[target]]`, and the resolver's fallbacks (`services/document_manager.ts`: by name, by frontmatter id, by title) |
| The bibliography | `services/bibliography.ts` | the CSL items, keyed by `citation-key ?? id`, with formatting cached — needs an `entries()` for the list |
| The workspace's documents | `services/document_manager.ts` | a name index, an id index and a title cache — needs a `documents()` list of `{ id, title }`, built in the background and rebuilt on `WORKSPACE_CHANGED` |
| A card beside the caret | `footnote_preview.ts` | a fixed-position card clamped to the window, which is the popup's shape |
| A handler the editor asks before it acts | `markdown_editor.ts: setSourceEntryHandler` | the same seam: a popup offers to answer a key (an arrow, Enter, Escape) before the editor's own text path sees it |
| Typing is not a command | `markdown_editor.ts: handleKeydown`, `commands/keymap.ts` (chords only) | where `[` and `@` are answered |
| Pure rules with a check beside them | `syntax/*.ts`, `test/checks/*` | where the pairing, the queries and the filtering go |

## The design

### 1. The rules, in one home (pure)

`ui/markdown/syntax/brackets.ts`:

| Rule | What it says |
| --- | --- |
| `pairingFor(text, caret, key, literal)` | what typing a bracket inserts: `[]` with the caret inside, `[` alone when the next character is already `]` (which is what makes `[[` become `[[]]` rather than `[[]]` + one more), nothing at all in a *literal* region, and nothing around a selection the author has made |
| `skipClosing(text, caret, key)` | whether typing `]` should step over the `]` the app itself put there instead of writing a second one |
| `unpairOnBackspace(text, caret)` | whether deleting the `[` of an empty `[]` deletes both characters, so a mistyped bracket does not leave a stray `]` behind |

`ui/markdown/syntax/completions.ts`:

| Rule | What it says |
| --- | --- |
| `citationQuery(text, caret)` | the `@` the caret is typing inside — `{ from, query }` — or null. The key's characters come from the citation plugin's own set, so a popup can only offer where a citation can exist |
| `wikilinkQuery(text, caret)` | the `[[` the caret is inside, or null |
| `citationChoices(entries, query, limit)` | the entries to offer, filtered on the key **or** the title, prefix matches first, capped |
| `documentChoices(documents, query, limit)` | the same for the workspace, filtered on the id **or** the title |
| `insertionFor(choice)` | what Enter writes: the citation's key, and for a document its **id** when it has one and its name otherwise (the resolver's own fallback, so what is written is what resolves) |

### 2. The living part (`ui/markdown/editing/completions.ts`)

One module follows the caret: after a keystroke that changed the text it asks the two query rules
what the caret is inside, opens or refreshes the card, and closes it when the answer is nothing;
it answers `ArrowDown`/`ArrowUp` (selection), `Enter`/`Tab` (accept) and `Escape` (close, leaving
the text) *before* the editor's text path, through the same "handler the editor asks" seam the
source view already uses. Enter accepts by one `applyEdit`, so the insertion is one undo step and
the caret lands after what was written.

### 3. The card (`ui/markdown/completion_card.ts`)

A daisyUI list beside the caret (fixed position, clamped to the window, as the footnote preview
does): one row per choice — the key (or the id) in monospace, the title dimmed beside it — and the
selected row highlighted, with its title shown in full. It takes the pointer for clicking, and
closes on a click elsewhere, on losing the query, and on Escape.

### 4. Where the choices come from

`bibliographyManager.entries()` — `{ key, title }` for each CSL item, read from the same parsed
data the citation formatting uses, so the list cannot disagree with what a citation shows.
`documentManager.documents()` — `{ id, title }` for each markdown file in the workspace, read in
the background (a vault is many files) and cached until the workspace changes.

## Tasks

- [ ] Task 1: the rules and their check — `syntax/brackets.ts`, `syntax/completions.ts`, and
      `test/checks/check-brackets.mjs` / `check-completions.mjs`.
- [ ] Task 2: the choices — `bibliographyManager.entries()`, `documentManager.documents()`, and
      cases for the filtering rule.
- [ ] Task 3: the card.
- [ ] Task 4: the bracket pairing in the editor's key path, and the "handler the editor asks" seam.
- [ ] Task 5: the citation popup (`@`), and the wikilink popup (`[[`).
- [ ] Task 6: the probes — `[` pairing (a pair, the `[[` case, a literal block, a selection),
      Backspace on a pair, the `@` list (filter by key, by title, arrows, Enter), the `[[` list
      (id and title, Enter writing the id, an id-less document writing its name), Escape.
- [ ] Task 7: acceptance and docs.

## Decisions I have made, and what I would change

1. **`[` pairs in prose and in the frontmatter, but not in a literal region** — a fenced code
   block, a display formula, an inline code span. A document's own syntax is not prose, and a pair
   the app writes into a code block changes the code.
2. **`]` steps over the `]` the app put there** (the other half of pairing; without it the pair is
   a nuisance), and **Backspace on an empty pair removes both**. Both are what every editor does
   with a pair it wrote itself; say if you want the plain behaviour.
3. **The `@` opens the list only where a citation can start**, which is the citation plugin's own
   rule — so `contact@example.com` is left alone, and the popup and the syntax can never disagree.
4. **Enter writes the citation key**, and for a wikilink the document's **id**, or its name when it
   has no id — so what is written is always something the resolver resolves.
5. **The list is filtered on both fields** (key or title for citations, id or title for documents),
   prefix matches first, capped at fifty rows; the workspace list is read in the background so a
   big vault cannot stall a keystroke.
6. **The arrows, Enter and Escape belong to the popup while it is open** (the text path resumes the
   moment it closes), and the popup is the one place that decides this — the editor asks it first.

## Handoff

*(written when the work lands)*
