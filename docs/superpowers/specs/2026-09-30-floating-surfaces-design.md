# Floating surfaces, and the messages they carry

## Problem

Eight things in this app float over the page, and they share no class. `BaseComponent`
(`ui/component.ts:8`) is the only common base, and it is DOM only: an element, `mount`, `destroy`.
What the surfaces share is three idioms, each written more than once.

| Idiom | Written in | Each writes for itself |
| --- | --- | --- |
| A panel inside its `relative` host, hanging under the button | `ui/session/stack_popover.ts:25`, `ui/toolbar/table_picker.ts:30` | its own Escape and outside-press listeners (`stack_popover.ts:54`, `table_picker.ts:70`), and the card classes |
| A `fixed` card beside a point in the page, clamped to the window | `ui/markdown/footnote_preview.ts:209`, `ui/markdown/completion_card.ts:142` | the same arithmetic twice — `Math.max(8, Math.min(…))`, below when it fits and above when it does not — and the same comment about living on the body, because a `fixed` element inside a scroll container is only fixed while no ancestor transforms |
| A veil over the window with a centred card | `ui/prompt.ts:56`, `ui/image/image_dialog.ts:49`, `ui/new_document/new_document_dialog.ts:68` | the same classes (`fixed inset-0 … bg-black/30`, card `w-[26rem] rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg`), the same Escape, and the same answer protocol: `answer: ((…) => …) \| null` (`prompt.ts:51`, `image_dialog.ts:44`, `new_document_dialog.ts:63`), a guard refusing a second question while one is open, and a `settle` that clears the promise |

The eighth is the toast (`ui/toast.ts:10`), and it is the odd one out: daisyUI's own `.toast` corner
container with `alert` boxes, dismissed only by its ✕ — no Escape, no clamping — and no probe in the
suite touches it, so nothing would notice it changing. It carries two kinds of message: a failure
(`services/notify.ts`) and a confirmation — the tree says `Path copied.`, `Name copied.`, `Id
copied.` (`ui/workspace/tree_ops.ts:95`, `:98`, `:251`), and those three are written in English in
the source, where every other word the app says comes from the catalogues. A fourth is on the
message this work already edits: `Failed to open {name}: {message}` (`ui/workspace/tree.ts:288`).

The user's ask: **replace the use of the toast with a popover** — a message should hang off the thing
it is about, and fall back to the window's corner when the caller holds no element — and give the
popovers the class they lack.

## Design

### 1. The family: one base, three kinds

New `src/ui/floating/`:

```ts
// surface.ts
export abstract class FloatingSurface extends BaseComponent {
  /** The card every surface in the app wears, in one place. */
  static readonly CHROME = 'rounded-lg border border-base-300 bg-base-200 shadow-lg';
  open(): void;   // unhide, mount where the kind says, place, and show
  close(): void;
  isOpen(): boolean;
  // Escape is wired here, once, for every surface. A kind may add rules beside it; none replaces it.
}
```

| Kind | File | Owns | Who is in it |
| --- | --- | --- | --- |
| `BesideCard` | `floating/beside.ts` | `fixed` on the body, placed beside a box (a caret's range, a marker, a row), clamped to the window; the pointer policy it was built with | the footnote preview, the completion list, the messages |
| `AnchoredPanel` | `floating/panel.ts` | `absolute` inside its `relative` host, under the button, with the alignment it was built with; closes on Escape, a press outside, a pick | the stack panel, the table picker |
| `QuestionCard` | `floating/question_card.ts` | the veil (`fixed inset-0` + centred card) and the answer protocol: one question at a time, Escape as the cautious answer, a promise settled once | the prompt's card hand, the image card, the new-note card |

The base holds what every kind has and **nothing else**. It must not grow `interactive`, `modal`,
`autoHide` or `dismissOnOutside` flags: a fact one kind has is either a parameter that kind is
*built* with (the gap, the pointer policy, the alignment) or a subclass of it. The moment the base
needs a switch to explain itself, this is the configurable class that was rejected, and this repo's
own rule — a small, well-named module over one that needs a paragraph — says no.

Every kind keeps the markers the probes already find. The migration changes how a surface is built,
never what it is called in the DOM:

| Marker | Found by |
| --- | --- |
| `.markdown-footnote-preview` | `footnote-preview.js` |
| `[data-completion]`, `[data-completion-row]` | `completion.js`, `completion-wikilink.js` |
| `[data-stack-row]`, `[data-stack-open]`, `[data-stack-drop]`, `[data-stack-empty]` | `document-stack*.js` |
| `[data-prompt]`, `[data-prompt-yes]`, `[data-prompt-no]` | every probe that answers a question |
| `[data-image-dialog]`, `[data-image-name]`, `[data-image-preview]`, `[data-image-where]`, `[data-image-save]` | `insert-image-blob.js` |
| `[data-new-document]`, `[data-new-document-folder]`, `[data-new-document-name]`, `[data-new-document-create]` | `new-markdown.js` |
| the panel `table-picker.js` finds as the sibling of the button (`.grid-cols-10`'s parent), and its squares by `data-row`/`data-column` | `table-picker.js`, `table-picker-insert.js` |

### 2. Where a card sits

One placement rule for every `BesideCard`, in one place: it is mounted on `document.body` (the
reason above), placed below the anchor's left edge with a 6px gap when it fits, above it when it
does not, and kept 8px inside the window on every side; a card wider than the window is clamped to
it. The caller turns its own anchor into a box (`{ left, top, width, height }`) — the caret's range
through `caret/geometry.ts: caretRect`, a marker or a row through `getBoundingClientRect` — so the
card never learns what it is pointing at.

Every card in the family takes the pointer — the footnote preview so a note can be read, selected
and linked out of, the completion list and the messages because they have rows and a ✕ to press.
The first pass of this design said the preview passed the pointer through, which its own module
header claimed and its code (and `footnote-preview.js`) had stopped doing long before: the card that
has to *not* take a press, if one is ever wanted, says so in its own classes, so the kind carries no
pointer switch.

Two visible consequences, both small: the completion list's gap goes from 4px to 6px, and its
placement keeps the caret's *range* as its anchor (the change the last branch made, now shared).

### 3. The messages, and the hints under them

Two surfaces say things to the reader, and the first revision of this design gave both the same one.
The user split them after living with it, and the split is the point of the whole feature:

**A message needs the reader's attention** — a failure the app can do nothing about. It waits in the
window's bottom-right corner *whatever it is about*, because a message belongs where the reader is
looking and not where the thing it names happens to be; it stacks above the last one; its ✕ is at
the card's right edge, however short the message is; and it waits for the reader — the ✕, or Escape
— because a failure they have not read yet should not leave on its own. A press elsewhere does not
take a message away.

`src/services/messages.ts` replaces `services/notify.ts` and takes the event constant that lives in
`services/workspace.ts:14` today:

```ts
export interface Message { text: string }
export const MESSAGE_EVENT = 'message';
export function notify(context: string, error: unknown): void;
```

`src/ui/messages.ts` (the file that was `toast.ts`) listens for the event and owns one `BesideCard`
per message, with no anchor: the corner, always. `main.ts:67` builds it where it built `Toast`.

**A hint only has to be noticed** — a path, a name or an id copied. It is the tree's confirmations,
which used to be toasts and then messages, and neither fits: not a toast because that surface is
gone, not a message because nothing about it wants the reader's action. `src/services/hints.ts`:

```ts
/** Where a hint belongs: the row of a workspace file. */
export interface HintPlace { path: string }
export interface Hint { text: string; at: HintPlace }
export const HINT_EVENT = 'hint';
/** The selector a place is found by. Pure. */
export function hintPlaceSelector(place: HintPlace): string;
export function showHint(text: string, at: HintPlace): void;
```

The place travels as a *name*, never an element, because `eventManager.emit` is Tauri's bus
(`services/event_manager.ts:33`): the payload is JSON, so a DOM node cannot ride it. A path resolves
to that file's row (`[data-tree-path="…"]`), and `hintPlaceSelector` escapes it — a quote, a
backslash or a newline in a file name must not break the selector — which is what the Node check
beside it holds.

`src/ui/hints.ts` listens for it and shows one hint — a `BesideCard` beside the row, `role="status"`,
no ✕ — which the reader never has to dismiss: a press anywhere else takes it away (Escape does too,
from the family), and a second hint replaces the first, because what the reader just did is the one
worth reading.

Renaming the event moves one other home with it: `test/checks/commands.mjs` lists the events that
genuinely cross windows, and `'toast'` in that list becomes `'message'` (the check fails without it).

### 4. Who says what

| Caller | What the reader gets |
| --- | --- |
| `ui/workspace/tree_ops.ts`, the three "copied" confirmations | a **hint**, beside the entry's row |
| `ui/workspace/tree_ops.ts`, every write that failed (rename, move, delete, reveal), and "no id" | a **message** in the corner |
| `ui/workspace/tree.ts:287` (a file that failed to open) | a **message** |
| `ui/image/image_flow.ts` (no folder, a bad folder, a write that failed) | a **message** |
| `ui/new_document/new_document_flow.ts` (no workspace, a write that failed) | a **message** |
| `services/session.ts:290` (a save the backend refused) | a **message** |
| `services/workspace.ts:65` (the workspace file itself) | a **message** |

### 5. The question cards

`QuestionCard` keeps the shell and the protocol, and the three cards keep their content: the prompt's
heading, message and two buttons; the image card's preview, folder line, name field and complaint;
the new-note card's folder list, name field and its create button. The content is a slot the
subclass fills, so the fields never push anything back up the hierarchy.

What each of them stops writing: `answer`, the guard, `settle`, the document-level Escape listener
and the veil's classes. What they keep: their markers, their two answers, and the promise each
returns — a `QuestionCard` is asked through the same port it is asked through today.

**The native hands stay out.** A system sheet is not a DOM surface. Which hand is in the room is one
rule (`ui/under_test.ts: drivenByTools`), and it lives behind the ports the app already has
(`Prompter`, `ImageChooser`, `NewDocumentChooser`). The hierarchy is about where a card floats; the
ports are about which hand answers. Folding them together would make the base know about the app.

### 6. Migration, in four steps, each green

1. `floating/` with the base and `BesideCard`, `services/messages.ts` with the place rule,
   `ui/messages.ts`, the `data-command` on the image button, the call sites in §4, and the new probe
   — the toast's job, done by a popover.
2. The completion list and the footnote preview onto `BesideCard`. Their two `place()`s and their
   card classes go.
3. The stack panel and the table picker onto `AnchoredPanel`. Their Escape and outside-press
   listeners go.
4. The prompt and the two cards onto `QuestionCard`. Three copies of the answer protocol go.

Steps 2–4 are independent of step 1 and of each other; stopping after any of them leaves the app
coherent, with the surfaces still holding their markers.

## Testing

- **A Node check** for `placeSelector`: a plain path, a command, nothing, and the two escapes (a
  quote and a backslash in a file name).
- **`test/probes/message-popover.js`**, the first probe the toast will ever have had: a real failure
  raised from the tree (copying the id of a note that has none, which writes nothing and asks the
  clipboard for nothing), the card beside that row and clamped inside the window, Escape and the ✕
  each closing it, a second message at the same place stacking under the first, and a message that
  names no place in the corner.
- **Every marker in §1** held by the probes that already read them; `npm run check` and the existing
  probes stay green through each step, and `cargo test` is untouched — nothing here reaches Rust.

## Out of scope

- The native hands (the system save sheet, the native dialog): ports, not surfaces.
- The find bar and the settings window: the first lives in the editor's own layout, the second is a
  window of its own.
- The editor's in-page source reveals: they replace text where it sits rather than float over it.
- Auto-dismissing messages, deliberately: a failure the reader may need to read should not leave on
  its own.
- The daisyUI `toast` and `alert` components, which nothing will use afterwards.

## Appendix: what was rejected

- **Share the pieces, not the class** — export `placeBeside`, the card class string and a dismissal
  helper, and have the surfaces call them. Smaller, but it leaves the veils' three copies in place
  and still gives the popovers no class to share, which is what the user asked for.
- **One configurable `FloatingCard`** with a placement mode and a list of dismissals: the fewest
  files, and the one unit that would need a paragraph to explain itself. It also makes a veil — which
  blocks the page — and a preview card — which is read-only — the same object with different
  switches, which is exactly the shape this design refuses.
