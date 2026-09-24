# Description Lists With Nodes the Plugin Cannot Write

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a description list can hold everything a paragraph can. Today it cannot: a
citation, a wikilink, inline math or a footnote reference inside a term or a detail
makes `syntax/parser.ts` throw, so the note does not open at all. P17's fuzz found it;
this is the fix, and the coverage that was missing for the whole definition-list path.

**Architecture:** `remark-deflist` rebuilds a description list by re-serializing its
paragraph with a CommonMark-only writer, which knows nothing the editor's pipeline adds.
`remarkDeflistCompat` already rewrites GFM's `delete` back to its own text for exactly
this reason; the set simply grows, and `fixDescriptionPositions` — which parses each term
and detail's *source* again with the full pipeline — brings the nodes back with absolute
positions. No new machinery: the one existing seam, widened, plus the tests the path
never had.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+.

**Spec:** the note P17 left in `docs/superpowers/plans/2026-09-24-punctuation-in-plain-edits.md`
and `docs/roadmap.md`.

## Global Constraints

- **The document text stays the only source of truth**, and the tree the renderer reads
  must carry the *source* of each node: the fix rewrites nodes to the text they were
  parsed from, never to something new.
- The flattening may only touch a description-list paragraph: a citation in an ordinary
  paragraph, heading, quote, list item or table cell is already fine and stays fine.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green on a
  freshly started app.
- Commit style: `fix(…): …`, `feat(…): …`, `test(…): …`, `docs: …`, and a `merge:`
  commit.

---

## Part 1 — the design

### 1.1 What throws, measured

Every case below was run against the parser as it stands, with the editor's own pipeline:

| Document | Before |
| --- | --- |
| `term\n: detail\n` | parses |
| `see @smith2020 now\n` | parses (a citation in a paragraph is fine) |
| `term\n: detail with @smith2020 in it\n` | **throws** `Cannot handle unknown node 'citation'` |
| `term with @smith2020\n: detail\n` | **throws** the same |
| `term\n: detail with [[Note]] in it\n` | **throws** `… 'wikilink'` |
| `term\n: detail with $x$ in it\n` | **throws** `… 'inlineMath'` |
| `term\n: detail with [^1] in it\n\n[^1]: note\n` | **throws** `… 'footnoteReference'` |
| `term\n: detail with ~~struck~~ in it\n` | parses — the shim already handles `delete` |
| `term\n: detail with <https://x.example> in it\n` | parses (a link is CommonMark) |

The throw is inside `remark-deflist`, not in the two `stringifyProcessor` calls
`parser.ts` makes: instrumenting both showed neither of them throwing. The plugin
serializes the paragraph with its own bundled `mdast-util-to-markdown`, whose handler
table is CommonMark's.

### 1.2 The fix

`remarkDeflistCompat`'s flattening becomes the set of node types that writer cannot
handle, each rewritten by `stringifyProcessor` — which *does* have every extension the
main pipeline registered — to the source it was parsed from:

```ts
const UNWRITABLE_NODES = new Set([
  'delete',            // GFM's strikethrough
  'citation',          // the editor's own
  'wikilink',          // the editor's own
  'inlineMath',        // remark-math
  'footnoteReference'  // remark-gfm's footnotes
]);
```

The widen-the-set rule is one line in `flattenUnwritableNodes`; `fixDescriptionPositions`
then re-parses each term and detail's *source* with the full pipeline, so a
`descriptiondetails` holds a `citation` node again — with absolute positions, which is
the property that function exists for and the thing the new check asserts.

One boundary stays, and the handoff names it: a footnote *reference* in a term or detail
renders as its own text, because that re-parse is a fragment with no definitions in it.
Before this phase it crashed instead.

### 1.3 The coverage the path never had

No check and no probe covered a description list. Two are added:

- `test/checks/check-parser.mjs`: the pipeline's own check — every node type in a term
  and in a detail, with the node's *source* read back through its positions
  (`markdown.slice(start, end)`), and the same documents *without* a description list as
  the control (the flattening must not touch them).
- `test/probes/description-list.js`: the same thing in the app — a note whose detail
  cites opens, the detail renders the citation (`.markdown-citation`), the characters
  around it are where the document says they are (typing there lands there), and an
  entity beside it renders as its character.

Both checks bundle the parser for Node, and both need one bundling fix while here:
rolldown resolves `decode-named-character-reference` to its **browser** build, whose
entity decoder makes a DOM element at parse time — so `&amp;` throws a `TypeError` inside
a Node check. `platform: 'node'` gives the table build. `check-plain-edit.mjs` gets the
same flag and a document with an entity, so the landmine is gone rather than hidden.

---

## Part 2 — tasks

### Task 1: the nodes a description list can hold

**Files:**
- Modify: `src/ui/markdown/syntax/parser.ts`
- Add: `test/checks/check-parser.mjs`
- Modify: `test/checks/check-plain-edit.mjs`

**Interfaces:**

- Produces: no new exports; `remarkDeflistCompat`'s flattening covers five node types.

- [ ] **Step 1: The rule**

`UNWRITABLE_NODES` and `flattenUnwritableNodes` as in §1.2, with the module comments
rewritten: the writer is CommonMark-only, every construct the editor adds to a line is a
node it does not know, and the source is what the re-parse wants.

- [ ] **Step 2: The contract test**

`check-parser.mjs` bundles `syntax/parser.ts` with `platform: 'node'` and checks, for each
of `@smith2020`, `[[Note]]`, `$x$`, `[^1]` (with its definition) and `~~struck~~`:

1. a **detail** holding it parses, and the detail's children contain a node of that type;
2. a **term** holding it parses, and the term's children contain it;
3. the node's source, read through its positions, is exactly the text the author wrote;
4. the same text in an ordinary paragraph parses to the same node *without* the
   description list — the control for the flattening.

```bash
node test/checks/check-parser.mjs
npm run check
```

- [ ] **Step 3: The bundling fix, and the entity document**

`check-plain-edit.mjs` and `check-parser.mjs` bundle with `platform: 'node'`;
`check-plain-edit.mjs`'s corpus gains a document with an entity and a description list,
so the flag is proved by the check rather than by a comment.

- [ ] **Step 4: Commit**

```bash
git add src/ui/markdown/syntax/parser.ts test/checks/check-parser.mjs test/checks/check-plain-edit.mjs
git commit -m "fix(parser): a description list can hold a citation"
```

### Task 2: the same thing in the app

**Files:**
- Add: `test/probes/description-list.js`
- Modify: `test/README.md` (the probe count and the new name)

**Interfaces:**

- Produces: a probe that drives the path end to end; no source changes.

- [ ] **Step 1: The probe**

Loads a note with a description list whose detail holds a citation, an entity and a
wikilink; asserts the detail renders the citation and the wikilink as their widgets, that
an entity renders as its character, and that a letter typed inside the detail's text
reaches the document at the offset the document says — the mapping through a re-parsed
fragment, which is the fragile part this probe is for.

```bash
npm run probe -- --fixture default-document.md test/probes/description-list.js
```

- [ ] **Step 2: Commit**

```bash
git add test/probes/description-list.js test/README.md
git commit -m "test(parser): a description list in the running app"
```

### Task 3: Acceptance, docs, handoff

- [ ] **Step 1: The docs**

`docs/architecture.md`'s parser row (the repairs it names) gains the flattening;
`docs/roadmap.md` closes P17's leftover and records the footnote-in-a-detail boundary.

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 21/21 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 74/74 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

Append to this plan: what threw and where, the set and why each type is in it, what the
check and the probe prove, the bundling fix, and what is left.

```bash
git add docs/architecture.md docs/roadmap.md docs/superpowers/plans/2026-09-24-description-list-nodes.md
git commit -m "docs: close the description list handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/description-list-nodes -m "merge: a description list can hold a citation (parser)"
git rev-parse HEAD^{tree} codex/description-list-nodes^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
