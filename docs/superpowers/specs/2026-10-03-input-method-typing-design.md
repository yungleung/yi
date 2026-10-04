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

While an input method is composing, the word being chosen is **drawn where the reader is writing
it**: the marked text — pinyin, romaji on its way to kana, a hangul syllable — in the document's
own type, with the usual compose underline, at the caret. The first version of this design showed
nothing and left the whole of it to the system's candidate window; using it settled that, for a
method whose marked text is the pinyin, the reader is owed the characters they are typing.

The marked text is not in the document, and a block's rendering is a function of its own source, so
the composing text is a surface the editing layer owns, like the caret — and *where* it is written
took a second try. Drawn as an overlay at the caret it covers the words after it, which a reader
writing in the middle of a line sees at once; so it is written **into the line** instead — a span
at the caret, in the page's own type and scale, with the words after it moving along exactly as
they do in a system text field. What that costs is stated where it is paid: the span is not the
document's text, so the offsets mapping steps over it (`data-composing`, `caret/offsets.ts`), the
block it lands in is measured again because a longer word can wrap the line
(`virtual_block_renderer.ts: measureEditedBlock`), and the span is taken out — with the text node
it was cut out of joined again — before anything is written.

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

- **No composing text in the document**: what the method has marked is written into the line to be
  seen (`composition_view.ts`), the line moves to make room for it, and the system's candidate
  window is still where a candidate is chosen.
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

The `keyCode` 229 guard is about the character, not about 229 alone. Left as "229, always", it
would also swallow an `Enter` pressed while a method is merely *active* and not composing — a new
line the reader asked for and did not get. (It was first narrowed further, to a 229 key arriving
within 100 ms of a commit, `composition_input.ts: justComposed`; that turned out to be too narrow
— see below — and the window is gone.)

### A letter written twice (Caps Lock on)

Found by a reader: with a Chinese input method and **Caps Lock on**, typing a Latin letter duplicates
it. Caps Lock is what makes it visible: the method composes nothing there, it hands the letter on —
so one keystroke is carried by two paths at once. The method routes the key (a `keydown` marked only
by `keyCode` 229, with no composition behind it) *and* leaves the same letter in the seam, whose
`input` commits it. The 100 ms window did not cover this — no composition had ended — so the editor
typed the routed key and the seam wrote the letter again.

Measured on the reader's own machine (Simplified Pinyin, Caps Lock on, `key`/`keyCode`/`prevented`/seam
recorded per event): three letters typed left **four** characters in the document — `helloabc` came
out `helloAbcC` — with the letters arriving alternately through the key path and the seam, and the
last one through both.

The guard is now: a `keyCode` 229 key that **carries a character** (`event.key.length === 1`) belongs
to the input method, whatever happened before it; a 229 key that carries none — `Enter`, an arrow,
`Backspace`, `Tab` — is still the editor's. Which path each letter of a run travels by is the
method's business, and it varies letter by letter; what is now true is that each is written once.
`test/probes/input-method-passthrough.js` holds both halves — the letter carried by both paths lands
once, and a 229 `Enter` still starts a line — and it fails without the change (`hellobb`).

### A word that could not be written at all

Found by the reader: click to place the caret, then type pinyin, and *the first letter* lands in the
document as a Latin character — the composition only begins with the second, so `nihao` came out
`ni` and 好, and the word could never be written. The seam had the keyboard throughout; what it did
not have was the keyboard. A click is not one event but four, and the keyboard moves in the middle
of them: `pointerdown`, the browser focusing the focusable page the pointer is on (the prose root
has `tabindex`), `pointerup`, and only then the click that places the caret. The seam's hand-over
stands back while a gesture is in progress (`composition_input.ts: pointerDown`), so the keyboard
ends on the *page* and stays there — `afterClick` and `afterFrames` both the page, measured — and
the next key is the page's: `keydown 'n' keyCode 78 isComposing false`, typed by the editor, with
`compositionstart` only after it. That edit is what focuses the field, which is why the *second*
letter onward composes: the word reads `helloni好`.

The end of the gesture now hands the keyboard back (`composition_input.ts: regainKeyboard`, called
from the `pointerup` listener): blur now, focus on the next frame, and not for a selection that is
showing — the same hand-back an edit already uses, and the guard widened to take the keyboard when
it is anywhere *in the editor*, not only when the field already holds it. The same four events now
measure `afterFrames` the seam, and the word reads `hello你好`. Nothing about the document, the
caret or the seam's measured shape changed: what moved is *where* and *when* the keyboard goes
back, which is the input method's whole view of the field.

`test/probes/input-method-click.js` holds the half a probe can see — the hand-back is not in the
click's own turn, and the seat has the keyboard once that turn is over. The symptom itself needs the
real method, because a synthetic key types nothing into a field: `helloni好` before the change,
`hello你好` after it.

One case this rig could not settle by itself, and the next reader should know it is open: with **no
pointer gesture at all** — a dispatched click, or a field that has held the keyboard since before a
pause — the first key is still delivered to the page, and this machine reproduces it
intermittently behind an `osascript` activation. Every path a reader's hand actually takes (a click
on text, a click on empty space) goes through the gesture above.

### The Backspace that emptied the word

Found by the reader: with `你好` in the document and `zhongguo` being composed, pressing Backspace
until the last letter takes 好 out of the document with it — and the same inside an English word,
which is the same event with a different word around it. A key that edits the marked word is the
input method's: while the word is marked it takes a letter off *it*, and the key that takes the
**last** one arrives with the composition already over and nothing on it to say so (`isComposing`
false, `keyCode` 8, no `229`). Read as the editor's, it deletes the character before the caret in
the document.

So the seam answers the question the event cannot: `composition_input.ts: markedText` is true while
a word is marked and for a moment after one is let go — the same 50 ms (`MOMENT_MS`) the space that
chose a candidate already needed, both being a composition's own key delivered once more when it is
over — and `handleKeydown` leaves a Backspace to the method while it is true. Nothing else moved: a
Backspace of the reader's own, with no word in flight, still deletes. `test/probes/input-method-backspace.js`
holds all three, and fails without the change (`你好` came back as `你`, then as nothing).

### The undo that left the keyboard behind

Found by the reader: commit `你好`, press ⌘Z, type pinyin — and the first letter goes in as Latin. An undo
is a change like any other, but it is not an *edit*: it never goes through `applyEdit`, so it never reached
`onChanged`, and nothing handed the keyboard back (`markdown_editor.ts: applyHistory` announced the change
to the session and stopped there). A field that keeps a stale input context is not in the input method: the
key log reads `keydown 'n' keyCode 78 isComposing false` — typed by the editor — where the same keystroke
after the hand-back reads `229` with `composing` true and opens a composition. `applyHistory` now hands it
back the way an edit does. `test/probes/input-method-undo.js` holds the half a probe can see — the seat
blurs and takes the keyboard again — and fails without the change.

### The field that could be seen

Found twice, and the second report is what settled it.

First: with the typing line right above the status bar, the hidden field was observable. The seam
is a real box — the system will not compose in one as short as a line, so it is taller than one —
and it sits at the caret, so on the reader's last visible line its bottom edge reached past the
editor's: measured, **21px below** the scroller's bottom, over the status bar. Everything the field
*draws* is transparent by measurement, but what the *system* paints in it is not — its own caret,
the selection over the marked word — and that is what was on show.

The first answer moved the field up until it fitted, and the reader found the second: **two
vertical lines** at the caret. Moving the field moves the problem, because the system's caret is
drawn *in* the field: 21px above the reader's line is a field whose caret is drawn 21px above the
text — a mark of its own, beside the one the editor hides while a word is composed.

So the field stays exactly where the caret is, and is made to paint nothing at all: transparent ink
(which is what the caret takes its colour from, and what the earlier measurement found), and a
transparent selection over the marked word (`.markdown-composition-input::selection`) — the one
thing in it that was not transparent. Keeping it *there* also keeps it out of the layout's way: an
earlier version that read the editor's box on every caret move broke `typed-text.js`, which counts
the layout a plain letter reads, and the answer has to be none.

`test/probes/input-method-seam-box.js` walks the caret down to that line and composes there,
holding what is readable: the field is on the caret's own line and column, and nothing of it is
drawn. The selection's own rule is not readable from the computed pseudo-style — WebKit reports the
same value with and without it — so that half is the rule in `styles.css` rather than a check that
would pass either way.

### A word composed on a new line

Found by the reader: Enter at the end of the document, then type pinyin — the line, and the word, vanish.
The word being composed is written *into* the line, and a blank line is drawn as a placeholder rather than
characters: inserting at the very start of its text node — which is exactly where that caret is — split the
node at 0 and left an empty text node behind. Joining the halves again moves a caret anchored in an empty
node to the *element*, and an element-anchored caret inside a text leaf is a position
`caret/offsets.ts: documentOffsetAt` cannot read (the commit path's own log: `no offsets`, the caret's
parent `markdown-empty-line`). So the commit wrote nothing at all. The composing span now goes *beside* a
text node when the caret is at its edge, and only splits inside one.
`test/probes/input-method-blank-line.js` holds both edges — a line the reader has just made, and the end of
a written one — and fails without the change (`hello\n\n你\n` came back `hello\n\n`).

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
