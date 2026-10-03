# Typing through an input method

## Problem

The editor can be typed into in Latin letters only. Its text path takes characters out of
`keydown` (`markdown_editor.ts: handleTextKey`), which is exactly right for a keyboard that sends one
character per key and useless for one that composes: an input method — Chinese, Japanese, Korean,
and the Latin keyboards with dead keys — needs somewhere to compose a word before it commits, and
dictation and the emoji panel need somewhere to arrive.

Measured, with the caret placed by a click in the demo document:

- `document.querySelectorAll('[contenteditable], input, textarea')` is empty, the focused element is
  the prose root, and the native selection has `rangeCount: 0` — the editor clears it and draws its
  own caret span. There is therefore **no text input context at all**: the system will not open a
  composition there.
- `markdown_editor.ts` returns early on `isComposing` and nothing in the app listens for
  `compositionstart`, `compositionupdate`, `compositionend` or `input`. Dispatching all of them at
  the focused element leaves the document exactly as it was: the composed characters, dictation and
  the emoji panel all vanish.

This was never built rather than broken — the layer under it was ready for it. `history.ts` says
"a paste, or an input method committing a word, and either is a step of its own", and
`docs/architecture.md` says "a paste, an input method's commit, a newline, a format or any other
command is a step of its own and ends whatever run was open". What is missing is the seam between
the system and that commit.

## The reader's own answer

While an input method is composing, the page shows nothing of it: the system's own candidate window
carries the word being chosen, and the document reads exactly as its source does until the
characters commit. (The alternative — drawing the composing text in the page, in the document's
type and with the usual compose underline — was considered and set aside: it puts a decoration over
a rendering that is otherwise a pure function of the source, and it moves the layout mid-word.)

## Design

### 1. The seam (`src/ui/markdown/editing/composition_input.ts`)

One module owns one element: an invisible `<textarea>` inside the scroller, which holds the keyboard
whenever the editor has the caret, so the system has a real place to compose.

```ts
/** What the editor hands the seam: where a committed word goes. */
export interface CompositionInput {
  /** The element that holds the keyboard. The editor focuses it; nothing else may. */
  readonly element: HTMLTextAreaElement;
  /** Whether a composition is in flight, so the app's own keys keep out of it. */
  composing(): boolean;
}

export function installCompositionInput(
  host: HTMLElement,
  onCommit: (text: string) => void
): CompositionInput;
```

The element is a child of the scroller (`host`), so its `keydown`, `paste`, `copy`, `input` and
composition events bubble to the listeners the editor already has there — no second event wiring.
It is:

- **invisible but focusable**: `opacity: 0`, one character wide, `resize: none`, `overflow: hidden`,
  `tabindex="-1"`, `aria-hidden="true"`. Not `display: none` or `visibility: hidden`, which cannot
  take focus — the whole point of it. `tabindex="-1"` keeps Tab out of it, and it is empty between
  commits, so neither the reader nor a screen reader ever sees text in it.
- **placed at the caret**: `position: absolute` inside the scroller, moved to the caret's box on
  every caret change and on every scroll of the scroller — the caret's own `caretRect()`
  (`caret/geometry.ts`) — so the system's candidate window opens at the caret rather than at the
  window's corner. With no caret at all (the editor is not where the reader is), the element is
  parked at the host's corner, where no composition can start.

**Focus belongs to the seam.** The places that put the keyboard in the editor — `focusText()`, a
click that places the caret (`context.ts: placeCaret`), a blank line's placeholder, a node's own
click — ask the seam for focus rather than the prose root. One `focusin` listener on the host does
it: anything focused in the editor that is neither the seam itself nor a real control of the app (a
field in the find bar, a dialog's input, a card's) is handed to the seam. A control keeps its own
focus, so the find bar and the dialogs are unaffected.

### 2. What does not move

The text path is untouched. `keydown` still comes to `markdown_editor.ts`, because the seam is a
child of the scroller the listener sits on, and every key the editor handles is still
`preventDefault`ed — which is also what keeps Latin characters out of the textarea. Only keys the
editor does *not* handle reach it, and while a composition is in flight those are the input method's
(`isComposing` is what `handleKeydown` already checks first). A keyboard's own composition — a dead
key, `´`, then a vowel — arrives with `key` = `Dead`, which is no character to the text path, so it
reaches the seam and commits like any other.

The element's own selection is **not** a document selection, and needs no guard: measured in this
webview, a textarea that holds the focus and has a selection made inside it does not appear in
`window.getSelection()`, so neither the `selectionchange` bookkeeping nor
`editing/context.ts: editorSelection` can mistake a marked range — the text some input methods
select while composing — for the reader's place in the document. (The same measurement is what makes
the seam safe to focus at all: a hidden textarea takes the focus, its keydowns bubble to the
scroller, and `preventDefault` on them leaves its value empty.)

### 3. The commit (`editing/text_commands.ts`)

```ts
/**
 * Inserts a word the system committed — an input method, dictation, the emoji panel —
 * as one edit that is a step of its own in the history.
 */
export function insertCommitted(context: EditorContext, text: string): boolean;
```

A sibling of `insertText`, sharing its range resolution and its block rules, with two differences.
It never writes a bracket's pair: the characters of a commit are the author's own text, and a pair
the app adds around them would be a second editor's opinion (a full-width `（` is not a pair in the
first place). And its edit is `other`, not `typing`, so it neither joins nor extends a typing run —
the rule `history.ts` already holds, and the reason one undo takes a committed word whole.

Everything else is the ordinary path: the caret's selection is replaced, an empty paragraph
materializes its line, a display formula's content gets its own line
(`syntax/math_edits.ts`), a table cell takes the text inside its own cell, and the session hears the
edit through `onChanged`.

The seam commits on `compositionend`, and on an `input` that arrives while no composition is in
flight (dictation, the emoji panel, an autocorrection the system performs). It reads the whole value
of the textarea, clears it, and hands it over; an empty value commits nothing, which is what
cancelling a composition leaves behind — and what the `input` that follows a commit finds, so a word
is never inserted twice.

### 4. Escape, and the surfaces that listen for it

Escape while composing belongs to the input method — it cancels the composition — and the app must
not act on the same key. The editor's own key path is already out of the way (`isComposing`), but the
surfaces that listen for Escape on the document (`ui/floating/surface.ts`: a message card, the
footnote preview, the versions panel) are not, and a cancelled composition must not also close what
the reader has open. Their guard is one line in the one place they all share: a key that arrives
while composing is not theirs.

### 5. What this does not do

- **No composing text in the page**, per the reader's answer above; the system's candidate window is
  the whole of it.
- **No per-keystroke document edits**: nothing is written into the file or the undo log until a word
  commits.
- **Nothing for the app's own fields** — the find bar, the settings, the cards' inputs are real
  inputs and were never broken.
- **No change to the plain key path, the caret, or the source-of-truth model**: the seam is a
  keyboard target, not a second document.

## Testing

### What the system refused (measured after the fact)

The seam as designed above — invisible — does not work with a real input method, and the reader was
right to say so. macOS's Input Method Kit will not open a composition in a field it cannot see.
Six measurements, with the system's own keystrokes (`keystroke "nihao"`, Simplified Pinyin, the app
frontmost) at a field inside the editor:

| the field | composition |
| --- | --- |
| `opacity: 0`, but a real 240×60 box | none — the letters went into the document as typed |
| a real box, ordinary size, transparent ink | none |
| a 1px box, ordinary ink and background | none |
| a 20×26 box with `caret-color: transparent` | none |
| a plain visible 20×26 box | `compositionstart` → updates → `compositionend` |
| a plain visible 240×60 box outside the editor (a control) | the same |

So the seam must be a field the system can see: **visible ink, a real box, and its own caret**. That
makes "nothing of the composition is drawn in the page" impossible as written — the field exists at
the caret, and what the system composes into it is drawn there. What is left to choose is how much
of it the reader sees, which is the design's next step and the reader's call.

### What composes (measured)

The field that does the job is invisible to the reader and visible to the system — and the reader's
own constraint is what the background does: a transparent one hides no character, so no word gains a
gap where the seam sits.

| the field | composition |
| --- | --- |
| `opacity: 1`, a ~96×48 box, `color: transparent`, `background: transparent`, no `caret-color` declared | `compositionstart` → updates → `compositionend`, and 你好 in the document |

Four details of that recipe, each one measured:

- **No `opacity: 0`, and a real box.** A field one line high (18px) gets nothing, and neither does
  one a pixel wide; about 26px tall and a few characters wide does. `styles.css` therefore fixes the
  width and a `min-height` of two lines, and the module seats the seam at the caret **without**
  sizing it to the caret's height.
- **Transparent ink and background**, not a transparent field: those are what make it invisible, and
  a transparent background is what keeps it from covering the characters under it.
- **No declared `caret-color`.** Declared transparent, WebKit refuses the composition; left alone it
  computes to transparent anyway (the ink is), so nothing at all is drawn — including the caret,
  which leaves the editor's own caret as the one the reader sees.
- **A dispatched click is not a real one.** macOS registers an input context when a real pointer
  focuses an editable element; a synthetic `MouseEvent` focuses the prose and registers nothing, so
  a probe that clicks first cannot then compose. Real keystrokes at the running app do compose — the
  row above is one of those runs — while a probe still drives the seam with dispatched composition
  events, which is what the suite's checks do.

### What the first reader found, and what it cost

Using it for real turned up two more faults, both in the seam's commit path:

- **A space after every Chinese word.** The key that *chooses* a candidate — a space in every input
  method tried — is handed to the field once more as ordinary text a moment after the composition
  ends, so committing whatever the field held typed the space into the document. It is the input
  method's key, not the author's text: the seam drops a lone space that arrives within a moment of a
  commit, and nothing else about committing changed.
- **Chinese that stopped working after the first word.** Committing is an edit; an edit restores the
  caret; restoring the caret asked the field for the keyboard. That is a native focus call, raised
  in the middle of the input method's own key handling, and after it the method gave up on the
  field. `focusText` now asks only when the field does not already hold the keyboard.
- A third, found while reproducing the first: an input method that sends its marked text with
  `insertCompositionText` and *no* composition events had that text typed into the document
  character by character. The seam's `input` handler now ignores that kind.

The root of the second one, once the key log was read: the keys *during* a composition reach the
editor as `keyCode` 229 with `isComposing`, but the key that *picks the candidate* arrives with the
composition already over — `229` and `isComposing: false` — so the key path typed it (the space)
and, being an edit in the middle of the method's own key handling, that is what the next word never
recovered from. `handleKeydown` now leaves a `keyCode` 229 key to the input method, and the seam
hands itself the keyboard again once a commit's turn is over, which is what brings the input context
back. Both are in the key log: two words in a row now arrive as `229/composing` … `229/plain`
twice, and the document reads `你好你好`.

### The same fault in the general case

**Any** edit costs the field its input context, not only a commit: an `Enter` that starts a line is
an edit too, and after it the next word never composed. So the seam takes the keyboard back after
every edit the editor reports (`markdown_editor.ts: onChanged` → `regainKeyboard`), and leaves it be
when the edit left a *selection* showing, because a focus change would drop that.

The `keyCode` 229 guard narrowed at the same time. Left as "229, always", it would also swallow an
`Enter` pressed while a method is merely *active* and not composing — a new line the reader asked
for and did not get. It now covers only a 229 key arriving right after a composition ended, which is
the one that picked the candidate: a 100ms window, `composition_input.ts: justComposed`.

### The ghost after ⌘Z

One more, found by the same reader from the other side: type a word in the middle of a word, press
⌘Z, and the character stays on the page while the document — and the saved file — no longer has it.

A committed word is written by the *plain-keystroke path* (`editing/typed_text.ts`): the characters
go into the text node the caret is in and nothing is rebuilt. The renderer remembers each mounted
element by the text it was **built from** (`virtual_block_renderer.ts: builtFrom`), and the write
left that record naming the older text — so an undo back to it compared equal, looked like "nothing
to re-render", and the ghost stayed. It is not input-method-specific: any typed letter undoes the
same way, and `notePatchedBlock` had been written for exactly this shape after a *formatting* patch.
`measureEditedBlock` now records the new content too, and `test/probes/undo-plain-write.js` holds
both halves — a committed word and a typed letter — from the reader's side.

### Selecting text

The seam's focus rule had one more thing to learn, and the reader asked about it: dragging over the
page focuses the scroller at `mousedown`, and taking the keyboard for the seam *then* — a focus
change in the middle of a drag — is what cancels the selection. The hand-over now waits while a
pointer is down, and while a selection is showing (which `regainKeyboard` already respected), so a
gesture belongs to the reader and the click that places a caret hands the keyboard over when it is
over. `input-method.js` holds both halves of that rule.

- **A probe** (`test/probes/input-method.js`): with the caret placed by a click, an editable element
  holds the focus and sits on the caret's line — what the system needs, and what a probe can see;
  dispatching `compositionstart` → `compositionupdate` → `compositionend` at it puts the committed
  character in the document at the caret and leaves the seam empty; the page shows nothing while
  composing; one undo takes the whole word back; dictation's `input` (no composition) lands the same
  way. Keep it inside the bridge's five seconds — split it by case if it does not fit.
- **The blocks** (`test/probes/input-method-blocks.js`): a committed word in a heading, a list item,
  a table cell, a fenced code block and an empty display formula — the last two are where a write
  has rules of its own (`syntax/math_edits.ts`, the literal regions).
- **The escape guard**: a probe holds a message card open, cancels a composition with an Escape
  carrying `isComposing`, and checks the card is still there.
- **Node**: no new rule is expected — the commit's "step of its own" is `history.ts`'s `other`
  kind, which `check-history.mjs` already walks. If a pure rule does appear (what a commit trims,
  which keys belong to the seam), it gets a check in `test/checks/`.
- **By hand, once**: a real input method on a real keyboard — the system's candidate window opening
  at the caret is the one thing no probe can drive. If this machine has a Chinese input source, the
  same can be tried through the system's own keystrokes.
