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
| `pairingFor(text, caret, key, literal)` | what typing a bracket inserts: `[]` with the caret inside, and a second `[` in front of the `]` the first one's pair left after the caret writes its own pair *there* — which is what makes `[[` two pairs, `[[]]`, with the caret between them — nothing at all in a *literal* region, and nothing around a selection the author has made |
| `skipClosingFor(text, caret, key, literal)` | whether typing `]` should step over the `]` the app itself put there instead of writing a second one |
| `pairAround(text, caret)` | the two characters of an empty `[]` a Backspace is about to take away whole, so a mistyped bracket does not leave a stray `]` behind |

`ui/markdown/syntax/completions.ts`:

| Rule | What it says |
| --- | --- |
| `citationQuery(text, caret)` | the `@` the caret is typing inside — `{ from, query }` — or null. The key's characters come from the citation plugin's own set, so a popup can only offer where a citation can exist |
| `wikilinkQuery(text, caret)` | the `[[` the caret is inside, or null |
| `matchingChoices(choices, query, limit)` | the entries to offer, filtered on the value **or** the title, prefix matches first, capped at fifty (`CHOICE_LIMIT`). Written as one rule rather than the two this plan first named (`citationChoices`, `documentChoices`): a citation key and a document are the same shape, `{ value, title }`, and the two lists differ only in where the values come from |
| — (no `insertionFor`) | what Enter writes is the choice's own `value`: the source decides it (`bibliographyManager.entries()` gives the key, `documentManager.documents()` the document's **id**, or its name when it has none — the resolver's own fallback, so what is written is what resolves) |

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

- [x] Task 1: the rules and their check — `syntax/brackets.ts`, `syntax/completions.ts`, and
      `test/checks/check-brackets.mjs` / `check-completions.mjs`.
- [x] Task 2: the choices — `bibliographyManager.entries()`, `documentManager.documents()`, and
      cases for the filtering rule.
- [x] Task 3: the card.
- [x] Task 4: the bracket pairing in the editor's key path, and the "handler the editor asks" seam.
- [x] Task 5: the citation popup (`@`), and the wikilink popup (`[[`).
- [x] Task 6: the probes — `[` pairing (a pair, the `[[` case, a literal block, a selection),
      Backspace on a pair, the `@` list (filter by key, by title, arrows, Enter), the `[[` list
      (id and title, Enter writing the id, an id-less document writing its name), Escape.
- [x] Task 7: acceptance and docs.

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

**State: done, on the branch, unmerged — the user reviews it first.** `npx tsc --noEmit` is silent
and `npm run check` is **34/34**. The probes are `brackets.js`, `completion.js` and
`completion-wikilink.js`, all green, each inside the bridge's 5 s budget (measured over two runs:
3.9–4.1 s apiece, no recovery). What landed:

- the rules and their checks (`syntax/brackets.ts`, `syntax/completions.ts`), with the citation
  plugin's own key characters exported so the popup and the syntax share one answer;
- the two sources of names (`bibliographyManager.entries()`, `documentManager.documents()`);
- the card (`completion_card.ts`) and the living module (`editing/completions.ts`), wired into the
  editor's key path: a list in hand owns the arrows, Enter, Tab and Escape, and the list is redrawn
  after every key the text path handled;
- the pairing wired into the text path (`editing/text_commands.ts: insertText`, and Backspace);
- the card's own "closes on a click elsewhere", which was documented and not wired: the editor
  closes the list from a **captured** click (`markdown_editor.ts`), because a click that lands on a
  markdown node is answered by the node and stops there before it bubbles.

**The four failures, and what they were.** The first three were one fact, and it was the *rule* and
not the caret: a second `[` in front of the `]` the first one's pair had written inserted `[`
alone, so `[[` came out `[[]` rather than `[[]]` and the caret sat one character short of the rule
the probe was written against. `pairingFor` now writes its own pair in front of a closer that is
already there (a key that closes itself still writes only itself, or a `"` in front of a `"` would
leave three); the fourth failure was that same fact seen from the end — Enter replacing the range
`[[<id>]`, one `]` short — and went with it. The literal-region check was not a rule failure at all:
the probe clicks a pixel past a character boundary, so the caret lands *inside* the word `code` and
only the author's own `[` is written, which is what the check now says (`c[ode`); the first pass had
written the expectation for the head of the block.

**One file became three.** `test/probes/completion.js` was over the bridge's 5 s budget (measured:
5007 ms, recovered from the stash) once it carried both lists and the pairs. It is now `brackets.js`
(the pairing: the pair, the `[[`, the step over, Backspace, the selection, the literal block),
`completion.js` (the citation list, and the click that closes it) and `completion-wikilink.js` (the
workspace's documents — the id Enter writes between the brackets, and the name a document with no id
is written by). `test/checks/check-brackets.mjs` already named `test/probes/brackets.js` as the
probe that proves the key path, and now there is one.

The docs and the checks that follow this work are updated: `docs/architecture.md` (the "one
keystroke" path, and the "where does this change go?" row), `docs/ai-context.md`, `docs/roadmap.md`,
`test/README.md` (both checks' rows and the three probes) and this plan. Nothing is merged.
