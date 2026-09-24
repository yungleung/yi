# Where a Code Block's Keystroke Goes

**Goal:** the measurement P27's handoff asked for. Two designs aimed at a code block's rebuild
and both came back equal in cost — P24 re-rendering the markup in place (31 ms against the
rebuild's 25) and P27 writing into the highlighted text node (28 against 30) — which means the
time is somewhere else in that path. This phase times the path's parts from inside the app and
says where.

**Architecture:** one probe, no editor code. Three of the keystroke's steps are methods on
objects a probe can reach — `VirtualBlockRenderer.prototype.renderChanged`/`renderBlock`/
`measureEditedBlock`, `MarkdownEditorState.prototype.getBlockContent` — so
`test/probes/keystroke-parts.js` wraps them, times each *exclusive* of the ones nesting inside
it, and reports what the keystroke costs beside it. The paragraph is the control: a keystroke
whose write *is* taken.

**Spec:** P27's handoff (`2026-09-25-code-you-can-type-into-now.md`), and the roadmap's
"Where typing is slow".

## What was measured

| One letter | Keystroke | `renderChanged` | Parse calls | Detached build |
| --- | --- | --- | --- | --- |
| inside an 80-line fenced code block | **31 ms** | **24 ms** | 12 calls, 4 ms, all cache hits | 11 ms |
| inside a paragraph | **3 ms** | — | 1 call | 2 ms |

So the code block's cost is the rebuild and nothing else: the parse is 4 ms of twelve cached
lookups, the detached build (highlight.js and its DOM) is 11 ms, and `renderChanged`'s own
remainder — the element swap and the window sync — is 13 ms. The paragraph pays none of it
because its keystroke is written into a text node instead.

## What it changes

The target is not the *write* — both write designs already avoided the rebuild and stayed at
~28 ms — but the **layout that any change to that block triggers**. An 80-line block of this
shape holds a few hundred highlight spans; a paragraph holds one line. If the spans are the
cost (the next measurement: force the same text change with them and without them, and time a
forced layout of each), then what follows is about the *markup* — fewer spans, or no
highlighting while a burst runs (exactly the trade-off P26 measured: invisible for ordinary
typing, visible for a delimiter) — and not about finding a cleverer place to write.

## Evidence

```bash
npx tsc --noEmit
npm run check                                   # 22/22 checks
npm run tauri dev                               # terminal 1, freshly started
npm run probe:all                               # 78/78 probes, 7 skipped
npm run probe -- --fixture default-document.md test/probes/keystroke-parts.js
```
