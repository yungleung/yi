# Writing comments

Comments are part of the interface here, not an extra. The editor subtree is 114
modules, and the way anyone — a contributor, or an agent with no history — finds
the right one is by reading headers before code. That is why one rule is checked
and the rest is a voice worth learning.

## The module header

Every module under `src/ui/markdown` opens with this, and nothing else:

```ts
/**
 * What this module is for, in one sentence.
 *
 * May import: <the layers, not the files>. Upholds: <the invariant this module is part of>.
 */
```

`test/checks/headers.mjs` enforces it, so `npm run check` fails naming the file and
what is missing. It covers the whole of `src/` — every module, declaration files
included — and a module without a header is a failure, not a style note. Three things
the check decides, in case you are wondering:

- **The header comes first** — above the imports. A prose block below them counts
  as no header at all, which is how seven modules were wrong before that check ran.
- **`.d.ts` files are included**, because a declaration file is a module with a
  contract too.
- **The first line is a sentence**, not the `May import:` line: a reader should be
  able to read the first line of twenty headers and know what the tree does.

`May import:` names the *layers* (`syntax`, `render`, `caret`, `commands`), not the
files — the layer table in `docs/architecture.md` is the authority for what a given
module may reach. `Upholds:` names the invariant from the list in the same
document; if you cannot tell which one, the module probably has no business
changing the document, and that is worth knowing before you write it.

Keep the prose you already have below the three lines. Long headers are fine — the
three lines are the contract, and the paragraphs are the reasoning:

```ts
/**
 * Keeps the spaces markdown drops at the end of a line visible.
 *
 * A line's trailing spaces are insignificant to markdown: a single space is
 * stripped, and two or more only become a hard break when a continuation line
 * follows. The parser therefore drops them, so a space typed at the end of a
 * line renders as nothing and the caret has no position after it — which is
 * why a list item in the middle of a list, or a definition line followed by
 * another detail, could not be edited with a trailing space.
 *
 * …and three more paragraphs of the same kind, below them the contract:
 *
 * May import: the marker rules (`./markers`). Upholds: one fact about markdown
 * syntax has one home, and this is the home of what markdown drops at the end of
 * a line.
 */
```

## Comments in the body: why, not what

A comment earns its place by saying something the code cannot. The code says
`element.style.containIntrinsicSize = …`; the comment says why anyone cares:

> A heavy block therefore entered the window at 60px and took its real height a
> frame later, which moves everything below it: the content shivers while
> scrolling. (`virtual_block_renderer.ts`, `setIntrinsicSize`)

The same is true of a measurement, which no amount of code can carry:

> `removeAllRanges` + `addRange` force synchronous selection painting, which is
> the dominant cost of a formatting edit on large documents (measured at ~140ms on
> the math-heavy file). (`caret/caret.ts`, `scheduleNativeSelection`)

and of an effect that happens outside this codebase at all:

> Restoring the caret can make the browser scroll the focused element or the
> synchronised selection into view — a scroll no seam in our code performs or
> sees. (`editing/context.ts`, `keepScroll`)

What is not worth writing:

- **A restatement of the next line.** `// increment the index` costs a reader a
  line and teaches nothing; delete it.
- **A second home for a fact.** If the marker characters are `markers.ts`'s, say
  *see `markers.ts`* rather than writing `'---'` in the comment as well. One fact
  has one home — that rule is about prose too, and it is why a rule restated in a
  second module is the failure the syntax check exists to catch.
- **`TODO`, `for now`, `temporary`.** Nothing tells a reader whether it is still
  true. Say what *is* true, and put what is missing in the commit message or the
  plan where it has a date and an owner.
- **`path:line`.** Lines move the next time anyone edits above them; name the
  module and the function (`editing/context.ts: keepScroll`) and let the reader
  search.

## Function comments: show the contract when an example is clearer

A function or method comment should not stop at saying what the function intends to do when one
short example can show the behaviour precisely. This is especially important for functions with:

- text in and text out;
- state before and after a mutation;
- an easy-to-confuse edge case;
- a failure that the function prevents; or
- a command or event contract that another client will call.

Put the example beside the contract, not in a separate document:

```ts
/**
 * Separates a paragraph from the block that follows it.
 *
 * Example: `breakParagraph('alpha\nbeta', 6)` returns `'alpha\n\nbeta'`.
 * A newline already at the split point is reused rather than doubled.
 */
export function breakParagraph(text: string, at: number): string;
```

For a command, showing the important failure is often clearer than describing the goal:

```ts
/**
 * Replaces a range only if the caller read the current document revision.
 *
 * Example: an agent plans against revision 42 while a person types at revision 43.
 * The command returns `stale` and changes nothing instead of replacing the person's new text.
 */
export function replaceRange(input: ReplaceRangeInput): CommandResult;
```

An example should be minimal, concrete, and deterministic. It may be pseudocode when dependency
objects would obscure the point, but its values and result must be clear enough to test mentally.
Do not add a ceremonial example to a trivial getter, setter, or one-line helper whose name and
signature already make the contract unambiguous.

## When a module is narrower than the shape

Two headers in this tree are deliberately narrower than the template, and they are
the interesting ones:

```ts
 * May import: nothing — the text and the line span are passed in.   // editing/line_removal.ts
 * May import: the DOM and `BaseComponent`. Upholds: the bar knows nothing about
 * the document — …                                                   // editing/find_bar.ts
```

If a header would need an "and" to be honest, the module is doing two jobs: split
it, or say so in the commit message rather than hiding it. A module that needs a
paragraph to explain itself is already the warning sign
(`AGENTS.md`).

## Where the rest of the conventions live

This page is only about comments. `docs/architecture.md` has the layers, the
invariants and the extension points; `docs/testing.md` has the checks and probes;
`docs/adding-a-node.md` and `docs/adding-a-command.md` are the recipes. Humans and
agents read the same pages on purpose — an agent's entry point is
`docs/ai-context.md`, which links to all of them, and a comment written for a
reader is a comment written for both.
