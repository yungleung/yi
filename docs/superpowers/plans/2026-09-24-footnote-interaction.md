# Footnote Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a definition's own label can be edited where it sits — the same click
rules the marker already has — and the preview card can be read and followed rather
than vanishing under the pointer.

**Architecture:** the definition's anchor shows the label's *own characters*
(`[^1]`) tagged as the block's text from offset zero, so the caret can be put in it
and the document edited there; the click split becomes the marker's — a plain click
edits, ⌘-click jumps — for both anchors. The card takes the pointer, hides only when
the pointer is outside both it and its marker (with a short grace so it can be
crossed), and follows a link in a note through the app's opener plugin.

**Tech Stack:** TypeScript (bundler resolution), Vite 8, Tauri 2, Node 20+, daisyUI 5,
`@tauri-apps/plugin-opener`.

**Spec:** this document's part 1; the two "what is left" notes in
`2026-09-24-footnote-source.md` and `2026-09-24-footnote-preview.md`.

## Global Constraints

- **The document is untouched by showing a card**; the only behaviour changes are the
  definition's label becoming editable and the card's pointer manners.
- `npx tsc --noEmit` and `npm run check` stay green; `npm run probe:all` stays green.
- Commit style: `feat(…): …`, `fix(…): …`, `test(…): …`, `docs: …`, and a `merge:`
  commit.

---

## Part 1 — the design

### 1.1 The definition's label

`FootnoteDefinition`'s anchor renders `[^label]` — the characters the author wrote,
taken from the node's own `label` (not its normalised `identifier`) — and tags itself
`data-text-from="0"`, because the definition's label *is* the block's text from
offset zero. That makes it a text leaf with an exact mapping: a click lands a caret
in the label and typing edits the document there, through the ordinary path (the
label's characters are not letters, so the fast path correctly refuses).

The click split becomes the marker's: `routeFootnoteClick` and `routeFootnoteMenu`
jump on ⌘-click for a *definition* too, so a plain click on `[^1]` edits it and
⌘-click jumps back to the marker. A click in the *body* is untouched — the body is
ordinary editable text — because only the anchor carries `data-footnote-def`.

While here: `syntax/footnotes.ts: footnoteOffsets` matches a label with a
case-sensitive regex, and markdown labels are not case-sensitive, so a label written
`[^Note]` does not jump today. One flag, one check case.

### 1.2 The interactive card

`pointer-events: auto` so the note can be read, selected and followed; the card and
the marker count as one region, so leaving the marker *towards the card* keeps it,
and leaving for anywhere else hides it after a short grace (the card sits a few
pixels below the marker, and a pointer needs to cross that). A click inside the card
no longer hides it — the content view's own click listener never sees it, because the
card lives on the page. A link in a note is followed through
`@tauri-apps/plugin-opener`'s `openUrl` (the plugin the app already registers in
Rust), with the click prevented so the webview never navigates; a fragment or a
relative href is left alone.

---

## Part 2 — tasks

### Task 1: The label that can be edited

**Files:**
- Modify: `src/ui/markdown/nodes/footnote.ts`
- Modify: `src/ui/markdown/click_routing.ts`
- Modify: `src/ui/markdown/syntax/footnotes.ts` (the label regex)
- Modify: `test/checks/check-footnotes.mjs`
- Modify: `test/probes/footnote-jump-back.js`

**Interfaces:**

- Produces: no new names; the anchor's shape changes and the click split widens.

- [ ] **Step 1: The anchor as the label's own text**

```ts
    const label = String(node.label ?? node.identifier ?? 'note');
    const anchor = document.createElement('a');
    anchor.id = `fn-${id}`;
    anchor.className = 'mr-2 font-semibold inline-block align-top';
    // The label as the author wrote it, tagged as the block's own text from its first
    // character: the caret can be put in it, and typing edits the document there (see
    // `caret/offsets.ts`). `id` stays the normalised name the jump is asked for.
    anchor.textContent = `[^${label}]`;
    anchor.dataset.textFrom = '0';
    anchor.dataset.footnoteDef = id;
    anchor.title = 'Click to edit the label, ⌘-click to jump to the marker';
```

- [ ] **Step 2: The same click split for both anchors**

```ts
  // Both a marker and a definition's label are text the author can edit where they
  // sit, so a plain click belongs to the editor and the jump is the ⌘-click (Ctrl-click
  // on a system that delivers it as a context menu — see `routeFootnoteMenu`).
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
```

replacing the `jumping` test, and `routeFootnoteMenu` accepting a
`[data-footnote-def]` as well.

- [ ] **Step 3: The label regex**

`footnoteOffsets`'s `reference` and `definition` patterns get the `i` flag, and
`check-footnotes.mjs` gains a case: a label written `[^Note]` and referred to as
`[^note]` still finds its definition and its reference.

- [ ] **Step 4: The probe, and the run**

`footnote-jump-back.js` becomes the mirror of `footnote-jump.js`: a plain click on
the definition's label puts the caret in it (asserted by typing a character and
reading the document), and a ⌘-click jumps back to the marker.

```bash
node test/checks/check-footnotes.mjs && node test/run-checks.mjs
npm run probe -- --fixture default-document.md test/probes/footnote-jump-back.js
npm run probe -- --fixture default-document.md test/probes/footnote-jump.js
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/markdown/nodes/footnote.ts src/ui/markdown/click_routing.ts src/ui/markdown/syntax/footnotes.ts test/checks/check-footnotes.mjs test/probes/footnote-jump-back.js
git commit -m "feat(footnote): edit a definition's label where it sits"
```

### Task 2: The card that can be read and followed

**Files:**
- Modify: `src/ui/markdown/footnote_preview.ts`
- Modify: `test/probes/footnote-preview.js`

**Interfaces:**

- Produces: no new names; the card's manners change.

- [ ] **Step 1: The card's manners**

```ts
const HIDE_GRACE_MS = 250;
```

with `pointerEvents = 'auto'`, a `hideSoon()` that waits the grace before removing
the card, `keep()` cancelling it, the marker's `mouseout` keeping the card when the
pointer goes to the card, and the card's own `mouseenter`/`mouseleave` cancelling and
starting the grace. A delegated click handler on the card:

```ts
    element.addEventListener('click', (event) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      const href = anchor?.getAttribute('href') ?? '';
      if (!anchor) {
        return;
      }
      // A note may link out; opening it is the app's job, and the webview must not
      // navigate to it.
      event.preventDefault();
      event.stopPropagation();
      if (/^https?:/i.test(href)) {
        void openUrl(href).catch(() => undefined);
      }
    });
```

with `import { openUrl } from '@tauri-apps/plugin-opener';`

- [ ] **Step 2: The probe learns the manners**

`footnote-preview.js` gains: the card stays while the pointer is inside it (hover the
card, wait past the grace, the card is still there); a link inside it is followed —
with the bridge's `invoke` stubbed to *record* the opener's call instead of opening a
browser, the click is asserted prevented, the recorded URL is the note's link, and
the document is unchanged. The existing "leaving takes it away" case waits past the
grace.

```bash
npm run probe -- --fixture default-document.md test/probes/footnote-preview.js
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/markdown/footnote_preview.ts test/probes/footnote-preview.js
git commit -m "feat(footnote): a preview you can read and follow"
```

### Task 3: Acceptance, docs, handoff

- [ ] **Step 1: The docs**

`docs/architecture.md`: the two footnote rows say the label is edited where it sits
(⌘-click jumps, for both anchors) and that the card is read-only against the
document but can follow a link out through the opener.

- [ ] **Step 2: Acceptance**

```bash
npx tsc --noEmit
npm run check                                   # 20/20 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 70/70 probes, 6 skipped
```

- [ ] **Step 3: The handoff, and the commit**

Append to this plan: what changed, the case-insensitive label fix, the card's grace,
the opener path and how the probe stubs it, and what is left (nothing in this
neighbourhood).

```bash
git add docs/architecture.md docs/superpowers/plans/2026-09-24-footnote-interaction.md
git commit -m "docs: close the footnote interaction handoff"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff codex/footnote-interaction -m "merge: edit a label, follow a note (footnote interaction)"
git rev-parse HEAD^{tree} codex/footnote-interaction^{tree}   # must be equal
```

Keep the branch, and report the tree hash.
