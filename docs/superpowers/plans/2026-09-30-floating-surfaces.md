# Floating surfaces, and the messages they carry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the eight floating surfaces of this app one shallow family of classes — a base and
three kinds — and replace the toast with messages that appear beside the thing they are about.

**Architecture:** `FloatingSurface` (a `BaseComponent`) holds what every surface has: hidden until
opened, the card's chrome, Escape, and the promise never to take the focus. Three kinds say where a
card floats — `BesideCard` (fixed, clamped beside a box), `AnchoredPanel` (inside its `relative`
host, under its button) and `QuestionCard` (a veil with a centred card and one answer). The message
surface is a `BesideCard` per message, placed by a pure rule from a *named* place (`{ path }` or
`{ command }`) because the event that carries it is Tauri's and its payload is JSON.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`), daisyUI 5 + Tailwind, Tauri 2, the Tauri MCP
bridge for probes (`npm run probe -- …`), Node checks bundled with rolldown (`npm run check`).

**Spec:** `docs/superpowers/specs/2026-09-30-floating-surfaces-design.md` — read it with this plan;
every task below is one of its §6 steps or a piece of them.

## Global Constraints

- Every new module under `src/ui` opens with the three-line header (`docs/writing-comments.md`):
  what it is for, what it may import, what it upholds. `test/checks/headers.mjs` fails without it.
- **The markers the probes already find never move**: `.markdown-footnote-preview`;
  `[data-completion]`, `[data-completion-row]`, `[data-completion-empty]`; `[data-stack-row]`,
  `[data-stack-open]`, `[data-stack-drop]`, `[data-stack-empty]`; `[data-prompt]`,
  `[data-prompt-title]`, `[data-prompt-message]`, `[data-prompt-yes]`, `[data-prompt-no]`;
  `[data-image-dialog]`, `[data-image-name]`, `[data-image-preview]`, `[data-image-where]`,
  `[data-image-save]`, `[data-image-complaint]`; `[data-new-document]`,
  `[data-new-document-folders]`, `[data-new-document-folder]`, `[data-new-document-name]`,
  `[data-new-document-create]`, `[data-new-document-cancel]`; the table picker stays the button's
  sibling, with squares carrying `data-row`/`data-column`.
- `npx tsc --noEmit` is silent and `npm run check` passes after **every** task; the probes a task
  names must pass with the app running (`npm run tauri dev`, bridge on 9223) and the workspace
  pointed at `test/fixtures/workspace`.
- One fact has one home; a syntax module never imports the DOM; no module reaches upwards.
- Nothing in this work reaches Rust, so `cargo test` stays at 21/21 throughout.
- Commit style: `type(scope): subject`, lower case, imperative. Work on the branch
  `codex/floating-surfaces`; **do not merge** — the user reviews.
- Behaviour changes need a test that fails without them; each task names the one that proves it.

## File structure

Created:

| File | Responsibility |
| --- | --- |
| `src/ui/floating/placement.ts` | the pure placement rule: a box, a card's size and the window's size → where the card sits |
| `src/ui/floating/surface.ts` | `FloatingSurface`: hidden/opened, the chrome, Escape, mount and place hooks |
| `src/ui/floating/beside.ts` | `BesideCard`: a fixed card clamped beside a box, or in the corner |
| `src/ui/floating/panel.ts` | `AnchoredPanel`: a panel inside its `relative` host, under its button |
| `src/ui/floating/question_card.ts` | `QuestionCard`: the veil, the centred card, and one answer |
| `src/services/messages.ts` | the message event, its two types, `placeSelector`, `notify` |
| `src/ui/messages.ts` | `installMessages()`: one `BesideCard` per message, stacked per place |
| `test/checks/check-placement.mjs` | the placement rule's cases |
| `test/checks/check-messages.mjs` | `placeSelector`'s cases, the two escapes among them |
| `test/probes/message-popover.js` | the message card, end to end |

Modified: `src/main.ts`, `src/services/workspace.ts`, `src/services/session.ts`,
`src/ui/workspace/tree.ts`, `src/ui/workspace/tree_ops.ts`, `src/ui/image/image_flow.ts`,
`src/ui/new_document/new_document_flow.ts`, `src/ui/toolbar/image_toolbar.ts`,
`src/ui/markdown/completion_card.ts`, `src/ui/markdown/editing/completions.ts`,
`src/ui/markdown/footnote_preview.ts`, `src/ui/session/stack_popover.ts`,
`src/ui/toolbar/table_picker.ts`, `src/ui/prompt.ts`, `src/ui/image/image_dialog.ts`,
`src/ui/new_document/new_document_dialog.ts`, `test/checks/commands.mjs`, `locales/*.json` (eight
files), `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`.

Deleted: `src/ui/toast.ts`, `src/services/notify.ts`.

---

### Task 1: the placement rule, in one pure place

**Files:**
- Create: `src/ui/floating/placement.ts`
- Test: `test/checks/check-placement.mjs`

**Interfaces:**
- Produces: `Box { left; top; width; height }`, `Size { width; height }`, `CARD_GAP = 6`,
  `WINDOW_MARGIN = 8`, `besidePlacement(anchor: Box | null, card: Size, window: Size): { left: number; top: number }`
  — a null anchor means the window's bottom-right corner.

- [ ] **Step 1: Write the failing check**

Create `test/checks/check-placement.mjs`:

```js
/**
 * Where a card floats (`ui/floating/placement.ts`) in Node: below what it points at when there is
 * room, above it when there is not, inside the window on every side, and in the corner when it
 * points at nothing.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-placement-'));
const bundle = await rolldown({ input: 'src/ui/floating/placement.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'placement.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { besidePlacement } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const window = { width: 1000, height: 800 };
const card = { width: 288, height: 160 };
const box = (left, top, height = 18) => ({ left, top, width: 2, height });

check('a card sits under what it points at', besidePlacement(box(400, 100), card, window), {
  left: 400,
  top: 124
});
check('and above it when there is no room below', besidePlacement(box(400, 700), card, window), {
  left: 400,
  top: 534
});
check('never past the right edge', besidePlacement(box(990, 100), card, window).left, 704);
check('nor past the left', besidePlacement(box(2, 100), card, window).left, 8);
check(
  'and a window too short for either keeps it at the top',
  besidePlacement(box(400, 700), { width: 288, height: 790 }, window).top,
  8
);
check('a card with nothing to point at hangs in the bottom-right corner', besidePlacement(null, card, window), {
  left: 704,
  top: 626
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('placement: all checks passed');
```

- [ ] **Step 2: Run it to be sure it fails**

Run: `node test/checks/check-placement.mjs`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Write the rule**

Create `src/ui/floating/placement.ts`:

```ts
/**
 * Where a floating card sits: beside the box it points at, or in the window's corner when it
 * points at nothing. Pure — the caller measures, this decides — so one rule answers for the
 * footnote preview, the completion list and a message, and a check holds it in Node.
 *
 * May import: nothing. Upholds: one answer to "where does a card go", so no surface writes the
 * clamping arithmetic a second time.
 */

/** A rectangle in the window's coordinates: what a card points at, and how big it is. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How much room there is: a card's own size, or the window's. */
export interface Size {
  width: number;
  height: number;
}

/** The gap between a card and what it points at. */
export const CARD_GAP = 6;

/** How far a card keeps from the window's edges. */
export const WINDOW_MARGIN = 8;

/**
 * Where a card sits: below its anchor's left edge when it fits, above it when it does not, and
 * inside the window on every side. A null anchor is a message with nothing to point at, and hangs
 * off the window's bottom-right corner, which the same arithmetic turns into a corner column.
 */
export function besidePlacement(
  anchor: Box | null,
  card: Size,
  window: Size
): { left: number; top: number } {
  const at = anchor ?? {
    left: window.width - WINDOW_MARGIN,
    top: window.height,
    width: 0,
    height: 0
  };
  const left = Math.max(
    WINDOW_MARGIN,
    Math.min(at.left, window.width - card.width - WINDOW_MARGIN)
  );
  const below = at.top + at.height + CARD_GAP;
  const top =
    below + card.height <= window.height - WINDOW_MARGIN
      ? below
      : Math.max(WINDOW_MARGIN, at.top - card.height - CARD_GAP);
  return { left, top };
}
```

- [ ] **Step 4: Run the check again**

Run: `node test/checks/check-placement.mjs`
Expected: PASS — `placement: all checks passed`.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then every check passes (35/35).

```bash
git add src/ui/floating/placement.ts test/checks/check-placement.mjs
git commit -m "feat(floating): one pure rule for where a card floats"
```

---

### Task 2: the base and the beside-card

**Files:**
- Create: `src/ui/floating/surface.ts`, `src/ui/floating/beside.ts`

**Interfaces:**
- Consumes: `Box`, `Size`, `besidePlacement` from Task 1.
- Produces: `FloatingSurface` (`.CHROME`, `open()`, `close()`, `isOpen()`, abstract
  `mountForShow()` / `placeForShow()`); `BesideCard` (its options are `anchor: () => Box | null`,
  `pointer?: 'take' | 'pass'`, `className?: string`).

- [ ] **Step 1: Write the base**

Create `src/ui/floating/surface.ts`:

```ts
/**
 * What every surface that floats over the page has, and nothing else.
 *
 * A surface is hidden until it is opened, wears the one card this app gives its floating panels,
 * answers Escape by going away, and never takes the focus or the caret: the author is typing in the
 * document under it, and a focused card would take that away. *Where* it floats, and what else
 * dismisses it, belong to the kind (`beside.ts`, `panel.ts`, `question_card.ts`).
 *
 * The base must not grow a switch (`interactive`, `modal`, `autoHide`): a fact one kind has is a
 * parameter that kind is built with, or a subclass of it — otherwise this is a class that needs a
 * paragraph to explain itself (see the design's appendix).
 *
 * May import: the component base. Upholds: one card, one Escape, one refusal to take the focus.
 */

import { BaseComponent } from '../component';

export abstract class FloatingSurface extends BaseComponent {
  /** The card every surface in the app wears, in one place. */
  static readonly CHROME = 'rounded-lg border border-base-300 bg-base-200 shadow-lg';

  private watchingEscape = false;

  protected constructor(classes: readonly string[]) {
    super('div', ['hidden', ...classes.filter((name) => name.length > 0)]);
  }

  /** Whether the surface is on screen. */
  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  /**
   * Shows it: mounted where its kind says, unhidden, then placed — a hidden element measures as
   * nothing, so the order matters.
   */
  open(): void {
    this.watchEscape();
    this.mountForShow();
    this.element.classList.remove('hidden');
    this.placeForShow();
  }

  close(): void {
    this.element.classList.add('hidden');
  }

  /** Where the surface goes the first time it is shown: the body, or its own host. */
  protected abstract mountForShow(): void;

  /** Where it sits each time it is shown. */
  protected abstract placeForShow(): void;

  /**
   * Escape puts every surface away. Wired on the first open, once, because the listener lives as
   * long as the window: a surface that has never been shown has nothing to put away.
   */
  private watchEscape(): void {
    if (this.watchingEscape) {
      return;
    }
    this.watchingEscape = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }
}
```

- [ ] **Step 2: Write the beside-card**

Create `src/ui/floating/beside.ts`:

```ts
/**
 * A card that floats beside a point in the page: the footnote preview, the completion list, and
 * every message the app has to tell the reader.
 *
 * It lives on the `document.body` rather than inside the editor's scroller, because a `fixed`
 * element inside a scroll container is only fixed while no ancestor transforms anything — and the
 * editor's page does transform. What it points at is a *box* the caller measures (a caret's range,
 * a marker, a row), so the card never learns what it is beside.
 *
 * May import: the surface base and the placement rule. Upholds: a card is where the rule says, and
 * a card with nothing to point at is in the corner.
 */

import { FloatingSurface } from './surface';
import { besidePlacement, type Box } from './placement';

/** Whether a press lands on the card, or goes through it. */
export type PointerPolicy = 'take' | 'pass';

/** The box of an element: what a card points at when it points at a row, a marker, or a button. */
export function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export interface BesideOptions {
  /** The box it points at, read when it is shown; null for a card that hangs in the corner. */
  anchor: () => Box | null;
  /**
   * `take` for a card with something to press (a ✕, a row), `pass` for one that is only read: the
   * footnote preview must never take a hover from the text under it.
   */
  pointer?: PointerPolicy;
  /** Classes for the card beyond the chrome: its width, its padding. */
  className?: string;
  /** Told when the card goes away, whichever way it went: Escape, or a press on its own ✕. */
  onClose?: () => void;
}

export class BesideCard extends FloatingSurface {
  constructor(private readonly beside: BesideOptions) {
    super([
      'fixed',
      'z-50',
      'select-none',
      FloatingSurface.CHROME,
      beside.className ?? '',
      beside.pointer === 'pass' ? 'pointer-events-none' : 'pointer-events-auto'
    ]);
  }

  close(): void {
    super.close();
    this.beside.onClose?.();
  }

  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {
    const box = this.element.getBoundingClientRect();
    const { left, top } = besidePlacement(this.beside.anchor(), box, {
      width: window.innerWidth,
      height: window.innerHeight
    });
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
```

- [ ] **Step 3: Type-check, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, then every check passes — `headers.mjs` is what proves both new modules carry
their header and their import/uphold lines.

```bash
git add src/ui/floating/surface.ts src/ui/floating/beside.ts
git commit -m "feat(floating): a surface base and a card that sits beside a box"
```

---

### Task 3: the message event and the place rule

**Files:**
- Create: `src/services/messages.ts`
- Test: `test/checks/check-messages.mjs`

**Interfaces:**
- Produces: `MessagePlace = { path: string } | { command: string }`, `Message { text; at? }`,
  `MESSAGE_EVENT = 'message'`, `placeSelector(place: MessagePlace | undefined): string | null`,
  `notify(context: string, error: unknown, at?: MessagePlace): void`.

- [ ] **Step 1: Write the failing check**

Create `test/checks/check-messages.mjs`:

```js
/**
 * What a message is and where it goes (`services/messages.ts`) in Node: a place names the tree row
 * of a file or the button that ran a command, a message with no place goes to the corner, and a
 * path with a quote, a backslash or a newline in it still makes a selector that finds it.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-messages-'));
const bundle = await rolldown({ input: 'src/services/messages.ts', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const file = join(directory, 'messages.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { placeSelector } = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check(
  'a file is found by its row',
  placeSelector({ path: '/notes/a.md' }),
  '[data-tree-path="/notes/a.md"]'
);
check(
  'a command by the button that ran it',
  placeSelector({ command: 'edit:insertImage' }),
  '[data-command="edit:insertImage"]'
);
check('and a message with no place is in the corner', placeSelector(undefined), null);
check(
  'a quote in a file name is escaped',
  placeSelector({ path: '/notes/say "hi".md' }),
  '[data-tree-path="/notes/say \\"hi\\".md"]'
);
check(
  'a backslash is escaped too',
  placeSelector({ path: '/notes/a\\b.md' }),
  '[data-tree-path="/notes/a\\\\b.md"]'
);
check(
  'and a newline cannot break the selector',
  placeSelector({ path: '/notes/a\nb.md' }),
  '[data-tree-path="/notes/a\\a b.md"]'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('messages: all checks passed');
```

- [ ] **Step 2: Run it to be sure it fails**

Run: `node test/checks/check-messages.mjs`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Write the module**

Create `src/services/messages.ts` (it replaces `services/notify.ts`, whose body moves here):

```ts
/**
 * Telling the reader something: a failure the app can do nothing about, or a confirmation like a
 * copied path. One event carries both, and where a message belongs travels with it.
 *
 * The place is a *name*, never an element: the event bus is Tauri's (`emit` serialises its
 * payload), so a DOM node cannot ride it. Two names are enough for every caller — a workspace path,
 * which means the tree's row for that file, and a command id, which means the button that ran it.
 * `placeSelector` turns either into the selector the message surface looks for; a message that
 * names neither, or names one that is not on screen, lands in the window's corner.
 *
 * May import: the event manager. Upholds: one way to say something to the reader, so no feature
 * invents a second one, and one place where a message's home is written down.
 */

import { eventManager } from './event_manager';

/** What a message is about: the row of a workspace file, or the button that ran a command. */
export type MessagePlace = { path: string } | { command: string };

/** What the app tells the reader. */
export interface Message {
  text: string;
  at?: MessagePlace;
}

/** Emitted with a `Message` whenever the app has something to say. */
export const MESSAGE_EVENT = 'message';

/** A CSS string: a quote, a backslash or a newline in a file name must not break the selector. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

/**
 * The selector a place is found by, or null for a message that names no place. Pure: the surface
 * does the looking, this only says what to look for.
 */
export function placeSelector(place: MessagePlace | undefined): string | null {
  if (!place) {
    return null;
  }
  return 'path' in place
    ? `[data-tree-path="${attributeValue(place.path)}"]`
    : `[data-command="${attributeValue(place.command)}"]`;
}

/**
 * Something did not work: the backend's own sentence reaches the reader, and the diagnosis stays in
 * the console under the context the caller names.
 */
export function notify(context: string, error: unknown, at?: MessagePlace): void {
  const text = error instanceof Error ? error.message : String(error);
  console.error(`${context}:`, error);
  void eventManager.emit(MESSAGE_EVENT, { text, at } satisfies Message);
}
```

- [ ] **Step 4: Run the check again, then commit**

Run: `node test/checks/check-messages.mjs`
Expected: PASS — `messages: all checks passed`.

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

```bash
git add src/services/messages.ts test/checks/check-messages.mjs
git commit -m "feat(messages): one event, and the place a message belongs to on it"
```

---

### Task 4: the messages surface, and the toast's last day

**Files:**
- Create: `src/ui/messages.ts`
- Delete: `src/ui/toast.ts`, `src/services/notify.ts`
- Modify: `src/main.ts`, `src/services/workspace.ts`, `src/services/session.ts`,
  `src/ui/workspace/tree.ts`, `src/ui/workspace/tree_ops.ts`, `src/ui/image/image_flow.ts`,
  `src/ui/new_document/new_document_flow.ts`, `src/ui/toolbar/image_toolbar.ts`,
  `test/checks/commands.mjs`, `locales/*.json`

**Interfaces:**
- Consumes: `MESSAGE_EVENT`, `Message`, `MessagePlace`, `notify`, `placeSelector` (Task 3);
  `BesideCard` (Task 2).
- Produces: `installMessages(): void`.

- [ ] **Step 1: Write the surface**

Create `src/ui/messages.ts`:

```ts
/**
 * What the app has to tell the reader, as cards beside the thing they are about.
 *
 * One `BesideCard` per message: beside the tree row of the file it names, beside the button that
 * ran the command, or in the window's corner when it names nothing this window can show. Messages
 * for the same place stack — each card hangs under the one already there — because two failures at
 * once must not land on top of each other.
 *
 * May import: the message service, the app's events, its words and the floating cards. Upholds: a
 * message is drawn from the event and nothing else, and the reader may always read it — nothing
 * disappears on its own.
 */

import { eventManager } from '../services/event_manager';
import { t } from '../services/i18n';
import { MESSAGE_EVENT, placeSelector, type Message, type MessagePlace } from '../services/messages';
import { BesideCard, boxOf } from './floating/beside';
import type { Box } from './floating/placement';

/** The box of the element a place names, or null when this window cannot show it. */
function boxOfPlace(place: MessagePlace | undefined): Box | null {
  const selector = placeSelector(place);
  const element = selector === null ? null : document.querySelector(selector);
  return element ? boxOf(element) : null;
}

/** Whether two messages want the same place: both nowhere, the same file, or the same button. */
function samePlace(left: MessagePlace | undefined, right: MessagePlace | undefined): boolean {
  if (!left || !right) {
    return !left && !right;
  }
  if ('path' in left && 'path' in right) {
    return left.path === right.path;
  }
  if ('command' in left && 'command' in right) {
    return left.command === right.command;
  }
  return false;
}

/** The messages on screen: their cards, and the place each of them is showing for. */
class MessageCards {
  private readonly showing: { card: BesideCard; place: MessagePlace | undefined }[] = [];

  /** One card for one message, under the last card already showing for the same place. */
  show(message: Message): void {
    const last = [...this.showing].reverse().find((held) => samePlace(held.place, message.at));
    let card: BesideCard;
    card = new BesideCard({
      anchor: last ? () => boxOf(last.card.element) : () => boxOfPlace(message.at),
      className: 'w-72 p-2 text-xs',
      // Escape and the ✕ both come through here, so the list of what is showing stays true.
      onClose: () => this.forget(card)
    });
    card.element.setAttribute('data-message', 'true');
    card.element.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.className = 'min-w-0';
    text.setAttribute('data-message-text', 'true');
    text.textContent = message.text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-xs btn-circle shrink-0';
    close.setAttribute('data-message-close', 'true');
    close.setAttribute('aria-label', t('message.close'));
    close.textContent = '✕';
    close.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    close.addEventListener('click', () => card.close());
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2';
    row.append(text, close);
    card.element.appendChild(row);
    card.open();
    this.showing.push({ card, place: message.at });
  }

  /** A card that went away leaves the list, and its element leaves the page. */
  private forget(card: BesideCard): void {
    card.destroy();
    const at = this.showing.findIndex((held) => held.card === card);
    if (at >= 0) {
      this.showing.splice(at, 1);
    }
  }
}

/** Starts listening: the toast's job, done by cards beside what they are about. */
export function installMessages(): void {
  const cards = new MessageCards();
  void eventManager.on(MESSAGE_EVENT, (event: any) => {
    cards.show((event?.payload ?? event) as Message);
  });
}
```

- [ ] **Step 2: Move every emitter onto the new event and the new places**

`src/services/workspace.ts`: delete the `TOAST_EVENT` constant and its comment; the
`workspace.failedToSave` message becomes
`void eventManager.emit(MESSAGE_EVENT, { text: t('workspace.failedToSave', { message }) })` — no
place, because the workspace file has no row.

`src/services/session.ts`: the failed save emits
`{ text: t('session.saveFailed', { title: document.title, message }), at: document.path ? { path: document.path } : undefined }`.

`src/ui/workspace/tree.ts`: a file that failed to open emits its own key, with the row it is about:

```ts
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('tree.openFailed', {
          name: this.info.basename,
          message: error instanceof Error ? error.message : String(error)
        }),
        at: { path: this.info.path }
      });
```

`src/ui/workspace/tree_ops.ts`: each of the six `notify('The workspace tree', error)` calls gains
the entry it was working on — `{ path: entry.path }` in `dropEntry`, `renameEntryTo`, `deleteNow`,
`reveal` and `copyId`, and `{ path: folder }` in `createAndRename`, where the row that exists is the
folder's. `copy` gains a third parameter for the same reason —
`async function copy(text: string, message: string, at: MessagePlace)` — and its two callers pass
`{ path: entry.path }`; the three confirmations become `t('tree.copiedPath')`, `t('tree.copiedName')`
and `t('tree.copiedId')`, and the "no id" message becomes
`{ text: t('tree.noId', { name: entry.basename }), at: { path: entry.path } }`.

`src/ui/image/image_flow.ts`: its four messages gain `{ command: 'edit:insertImage' }`.

`src/ui/new_document/new_document_flow.ts`: its three messages gain
`{ command: 'file:newMarkdown' }`.

`src/ui/toolbar/image_toolbar.ts`: the button names the command it runs, so a message can find it:

```ts
    const button = this.addButton(
      { label: t('toolbar.image'), icon: IMAGE_ICON, className: TOOL_ICON_SIZE },
      () => runCommand('edit:insertImage')
    );
    // A message carries a place, not an element (`services/messages.ts`), so the button says which
    // command it ran and the message surface comes looking for it.
    button.dataset.command = 'edit:insertImage';
```

- [ ] **Step 3: The words**

In all eight catalogues: rename `toast.close` to `message.close` (same text), and add the four
strings the source used to write in English — `tree.copiedPath`, `tree.copiedName`,
`tree.copiedId`, `tree.openFailed` (`Failed to open {name}: {message}` in English) — beside the
tree's other keys, in each language's own words.

In `test/checks/commands.mjs`, the cross-window list's `'toast'` becomes `'message'`.

- [ ] **Step 4: Wire it in, and take the toast out**

In `src/main.ts`: drop the `Toast` import, the `const toast = new Toast();` and the
`toast.mount(document.body);`, and call `installMessages();` where the toast was mounted. Delete
`src/ui/toast.ts` and `src/services/notify.ts`.

- [ ] **Step 5: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes — `check-locales.mjs` proves the four new keys exist in all
eight catalogues and are all used.

Run: `npm run probe -- --with-workspace test/probes/tree-create.js`, then `tree-file-actions.js`,
`new-markdown.js`, `insert-image.js`.
Expected: all pass — they raise the messages this task rewired, and nothing else changed.

```bash
git add -A src test locales
git commit -m "feat(messages): the app tells the reader beside the thing it is about"
```

---

### Task 5: the probe for the message card

**Files:**
- Create: `test/probes/message-popover.js`

**Interfaces:**
- Consumes: the markers `[data-message]`, `[data-message-text]`, `[data-message-close]` from Task 4,
  and the tree op `copy-id` (`src/ui/workspace/tree_ops.ts`), which asks for nothing and writes
  nothing.

- [ ] **Step 1: Write the probe**

Create `test/probes/message-popover.js`:

```js
/**
 * A message the app tells the reader, as the card it now is.
 *
 * The failure is a real one and writes nothing: copying the id of a note whose frontmatter has none
 * (`tree_ops.ts: copy-id`), which the reader reaches from the tree's own menu. The place it names is
 * that note's row, so the card must appear under *that* row — and a message that names no place must
 * appear in the window's corner, where the toast it replaces sat.
 *
 * @covers src/services/messages.ts, src/ui/messages.ts
 * @covers src/ui/floating/beside.ts, src/ui/floating/placement.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const { eventManager } = await t.app('/src/services/event_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const workspace = String((await invoke('get_config')).workspace ?? '');
  const notePath = `${workspace}/README.md`;
  const cards = () => [...document.querySelectorAll('[data-message]')];
  const card = () => cards().at(-1) ?? null;
  const row = () => document.querySelector(`[data-tree-path="${notePath}"]`);
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom)
    };
  };
  /** The failure that raises the message: that note has no frontmatter id. */
  const noId = async () => {
    await ops.runTreeAction('copy-id', { path: notePath, basename: 'README.md', isFile: true });
    await t.sleep(250);
  };
  /** Closes every message on screen, so each case starts from none. */
  const clear = async () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.sleep(200);
  };

  // 1. The card appears, says what went wrong, hangs under the row it is about, inside the window.
  await noId();
  const placed = { card: card() === null ? null : box(card()), row: box(row()), window: [window.innerWidth, window.innerHeight] };
  check(
    'the card appears under the row the message is about, inside the window',
    card() !== null &&
      card().querySelector('[data-message-text]')?.textContent?.includes('README') === true &&
      placed.card.top >= placed.row.bottom &&
      placed.card.left >= placed.row.left - 8 &&
      placed.card.right <= window.innerWidth - 8 &&
      placed.card.bottom <= window.innerHeight - 8,
    placed
  );

  // 2. The ✕ closes it…
  await clear();
  check('the ✕ closes it', cards().length === 0, { open: cards().length });

  // 3. …and Escape closes it too, which the toast never did.
  await noId();
  t.key('Escape');
  await t.sleep(200);
  check('and Escape closes it', cards().length === 0, { open: cards().length });

  // 4. Two messages at one place stack, the newer under the older.
  await noId();
  const first = box(card());
  await noId();
  const second = box(card());
  check('a second message at the same place hangs under the first', second.top >= first.bottom, {
    first,
    second
  });
  await clear();

  // 5. A message that names no place is in the corner, where the toast sat.
  await eventManager.emit('message', { text: 'A message with nothing to point at.' });
  await t.sleep(250);
  const corner = box(card());
  check(
    'a message with no place is in the window’s bottom-right corner',
    Math.abs(corner.right - (window.innerWidth - 8)) <= 10 &&
      Math.abs(corner.bottom - (window.innerHeight - 6)) <= 10,
    { corner, window: [window.innerWidth, window.innerHeight] }
  );
  await clear();

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
```

- [ ] **Step 2: Run it**

Run: `npm run probe -- --with-workspace test/probes/message-popover.js`
Expected: PASS with `"failed": []`, and the trailing `bridge:` line must not say the probe was
recovered — a run over the budget is a probe to split, not to keep.

- [ ] **Step 3: Commit**

```bash
git add test/probes/message-popover.js
git commit -m "test(messages): the card beside its row, and the corner when it names nothing"
```

---

### Task 6: the completion list onto the shared card

**Files:**
- Modify: `src/ui/markdown/completion_card.ts`, `src/ui/markdown/editing/completions.ts`

**Interfaces:**
- Consumes: `BesideCard` (Task 2), `Box` (Task 1).
- Produces: `CompletionCard.show(choices, selected, anchor: Box | null, onPick)` — the same call the
  editor already makes, with the anchor now a `Box`.

- [ ] **Step 1: Make the card a `BesideCard`**

`src/ui/markdown/completion_card.ts`: the class becomes `CompletionCard extends BesideCard`, holding
the caret's box for the anchor getter to read:

```ts
export class CompletionCard extends BesideCard {
  private anchorBox: Box | null = null;

  constructor() {
    super({
      anchor: () => this.anchorBox,
      pointer: 'take',
      className: 'flex max-h-64 w-72 flex-col overflow-hidden p-0'
    });
    this.element.setAttribute('data-completion', 'true');
    ... // the list and the empty paragraph are built exactly as they are today
  }

  show(
    choices: readonly CompletionChoice[],
    selected: number,
    anchor: Box | null,
    onPick: (choice: CompletionChoice) => void
  ): void {
    this.anchorBox = anchor;
    ... // the rows are drawn exactly as they are today
    this.open();
  }

  hide(): void {
    this.close();
  }
}
```

What goes: `place()`, the `fixed`/`z-50`/`rounded-lg`/`border`/`border-base-300`/`bg-base-200`/
`shadow-lg`/`select-none`/`hidden` classes, the manual `document.body.appendChild`, and the
`CompletionAnchor` type.

- [ ] **Step 2: The editor passes a box**

`src/ui/markdown/editing/completions.ts`: `caretAnchor()` returns a `Box` —
`{ left: rect.left, top: rect.top, width: 0, height: rect.height }` — and imports `Box` from
`../floating/placement` instead of `CompletionAnchor` from the card. Nothing else about the list
changes; its gap becomes the shared 6px, which is the only visible difference and which no probe
asserts at 4px.

- [ ] **Step 3: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run: `npm run probe -- test/probes/completion.js`, then `brackets.js` and `completion-wikilink.js`.
Expected: all three pass. `completion.js` is the one that proves it — its check *a row is the
popover's own width, flush to its border* and its check *and they move the entry, not the popover*
both fail if the card stops being a clamped card beside the caret.

```bash
git add src/ui/markdown/completion_card.ts src/ui/markdown/editing/completions.ts
git commit -m "refactor(completion): the list is the shared card beside the caret"
```

---

### Task 7: the footnote preview onto the same card

**Files:**
- Modify: `src/ui/markdown/footnote_preview.ts`

**Interfaces:**
- Consumes: `BesideCard` with `pointer: 'pass'`.
- Produces: nothing new; the card's element keeps `.markdown-footnote-preview`.

- [ ] **Step 1: Build the card through `BesideCard`**

In `installFootnotePreview`, the element built by hand becomes a `BesideCard`:

```ts
    const card = new BesideCard({
      anchor: () => boxOf(marker),
      pointer: 'pass',
      className: `${PREVIEW_CLASS} inline-block p-2`
    });
    card.element.append(withRenderFrame(definition.block, () => renderFootnoteBody(definition.node)));
    card.element.addEventListener('mouseenter', keep);
    card.element.addEventListener('mouseleave', hideSoon);
    // The captured click listener that hands a link to the app's opener is wired to the card's
    // element exactly as it is today — this task changes where the element comes from, nothing more.
    card.open();
```

`boxOf` is the helper Task 2 added to `src/ui/floating/beside.ts`; this caller imports it from
there, as `ui/messages.ts` does — one home for turning an element into a box.

The dwell (200 ms), the grace (250 ms), hiding on scroll, on a click in the text and on Escape all
stay where they are. `place(element, marker)` is deleted, and the `fixed`/`inline-block`/`rounded-md`/
`border`/`border-base-300`/`bg-base-200`/`shadow-lg` classes go with it.

- [ ] **Step 2: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run: `npm run probe -- --with-workspace --fixture default-document.md test/probes/footnote-preview.js`
Expected: PASS — the probe finds the card by `.markdown-footnote-preview`, measures that it sits
under its marker and inside the window, and that the pointer passes through it.

```bash
git add src/ui/markdown/footnote_preview.ts src/ui/floating/placement.ts
git commit -m "refactor(footnote): the preview is the shared card, read-only"
```

---

### Task 8: the two button-anchored panels

**Files:**
- Create: `src/ui/floating/panel.ts`
- Modify: `src/ui/session/stack_popover.ts`, `src/ui/toolbar/table_picker.ts`

**Interfaces:**
- Produces: `AnchoredPanel` — `constructor(options: { className: string })`, with the family's
  `open()`, `close()`, `isOpen()`, plus `toggle()` for the stack. A press outside closes it.

- [ ] **Step 1: Write the kind**

Create `src/ui/floating/panel.ts`:

```ts
/**
 * A panel that hangs under the button that opened it, inside that button's own `relative` host: the
 * stack, and the table picker.
 *
 * `absolute` rather than `fixed`, because a panel belongs to its toolbar: it moves with it, and it
 * never floats over a part of the page it has nothing to do with. It closes on Escape (from the
 * family), on a press outside it, and — the owner's business — on a pick.
 *
 * May import: the surface base. Upholds: a panel is inside its host, and the only thing outside it
 * that closes it is a press elsewhere.
 */

import { FloatingSurface } from './surface';

export interface PanelOptions {
  /**
   * Where under the button it sits: `right-0` for the stack, `left-1/2 -translate-x-1/2` for the
   * picker. Its host supplies the `relative` both are positioned against.
   */
  className: string;
}

export class AnchoredPanel extends FloatingSurface {
  constructor(private readonly panel: PanelOptions) {
    super([
      'absolute',
      'top-full',
      'mt-1',
      'z-50',
      'select-none',
      FloatingSurface.CHROME,
      panel.className
    ]);
    document.addEventListener('mousedown', (event) => {
      if (this.isOpen() && !this.element.contains(event.target as Node)) {
        this.close();
      }
    });
  }

  /** Its host owns it: the toolbar appends it when the toolbar is built. */
  protected mountForShow(): void {}

  /** Its place is its classes: under the button, aligned inside the host it was built into. */
  protected placeForShow(): void {}

  /** The press that opens and closes it again. */
  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }
}
```

- [ ] **Step 2: The stack panel and the picker use it**

`src/ui/session/stack_popover.ts` and `src/ui/toolbar/table_picker.ts` extend `AnchoredPanel`,
passing their alignment as `className` and keeping every marker (`data-stack-*`, and the picker's
squares with `data-row`/`data-column`). Their own Escape listener, their outside-`mousedown`
listener, their `hidden`/`open`/`close` triple and their card classes all go. Each is still appended
to its toolbar's element (the `relative` host), never to the body — that is what the picker probe
finds it by.

- [ ] **Step 3: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run: `npm run probe -- --with-workspace test/probes/document-stack.js`, then
`document-stack-ask.js`, `table-picker.js`, `table-picker-insert.js`.
Expected: all pass. The picker probes are the ones that prove the panel stayed inside its host: they
reach it as the button's sibling and click a square by `data-row`/`data-column`.

```bash
git add src/ui/floating/panel.ts src/ui/session/stack_popover.ts src/ui/toolbar/table_picker.ts
git commit -m "refactor(panels): the stack and the table picker share one kind"
```

---

### Task 9: the question card, and the prompt on it

**Files:**
- Create: `src/ui/floating/question_card.ts`
- Modify: `src/ui/prompt.ts`

**Interfaces:**
- Produces: `QuestionCard<A>` — an abstract `FloatingSurface` with `protected readonly card: HTMLElement`,
  `protected askWith(show: () => void): Promise<A>`, `protected settle(value: A): void`, and
  `protected abstract cautious(): A`.

- [ ] **Step 1: Write the kind**

Create `src/ui/floating/question_card.ts`:

```ts
/**
 * A question the app asks over the page: the prompt's card, the image card, the new-note card.
 *
 * The veil is the family's; what this adds is the *answer*: one question at a time, a promise
 * settled once, and Escape giving the cautious answer — never the one that acts. The card's own
 * content belongs to the subclass, which fills `card`; nothing about a field or a button belongs
 * here.
 *
 * May import: the surface base. Upholds: a question is answered once, and Escape is never the answer
 * that acts.
 */

import { FloatingSurface } from './surface';

export abstract class QuestionCard<A> extends FloatingSurface {
  /** The centred card the subclass fills. */
  protected readonly card: HTMLElement = document.createElement('div');

  private answer: ((value: A) => void) | null = null;

  protected constructor(className: string) {
    super(['fixed', 'inset-0', 'z-[60]', 'flex', 'items-center', 'justify-center', 'bg-black/30']);
    this.card.className = `rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg ${className}`;
    // A press in the card belongs to the card: the toolbar behind it must not begin a window drag,
    // and the panels behind it must not hear the press.
    this.card.addEventListener('mousedown', (event) => event.stopPropagation());
    this.element.appendChild(this.card);
    // Escape is the answer that is not "yes". The listener is on the document because the card
    // deliberately never takes the focus.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.answer !== null) {
        this.settle(this.cautious());
      }
    });
  }

  /** The answer Escape gives: the cautious one, which the subclass names. */
  protected abstract cautious(): A;

  /** Asks, once: a question asked while one is open is answered with the cautious answer. */
  protected askWith(show: () => void): Promise<A> {
    if (this.answer !== null) {
      return Promise.resolve(this.cautious());
    }
    this.card.replaceChildren();
    show();
    this.open();
    return new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  protected settle(value: A): void {
    const answer = this.answer;
    this.answer = null;
    this.close();
    answer?.(value);
  }

  /** Its place is the veil: it covers the window whatever the page is scrolled to. */
  protected mountForShow(): void {
    if (this.element.parentElement === null) {
      document.body.appendChild(this.element);
    }
  }

  protected placeForShow(): void {}
}
```

- [ ] **Step 2: The prompt on it**

`src/ui/prompt.ts`: `Prompt extends QuestionCard<boolean>`, `cautious()` is `false`, and the heading,
the message and the row of two buttons move from the constructor's locals to fields
(`this.heading`, `this.message`, `this.actions`), because the content is drawn on every ask.
`askOnTheCard` becomes

```ts
  private askOnTheCard(question: Question): Promise<boolean> {
    return this.askWith(() => this.fill(question));
  }

  /** Draws one question into the card the base owns. */
  private fill(question: Question): void {
    this.heading.textContent = question.title;
    this.message.textContent = question.message;
    this.yes.textContent = question.yes;
    this.no.textContent = question.no;
    this.card.append(this.heading, this.message, this.actions);
  }
```

The veil's classes, the `hidden` handling, the Escape listener, the `answer` field, the guard and the
`settle` that were its own all go; `drivenByTools()` and the native dialog hand are untouched. Every
marker stays: `data-prompt`, `data-prompt-title`,
`data-prompt-message`, `data-prompt-yes`, `data-prompt-no`.

- [ ] **Step 3: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run every probe that answers a question: `npm run probe -- --with-workspace test/probes/document-stack-ask.js`,
then `new-markdown.js`, `settings-push-on-open.js`, `tree-create.js`, `tree-delete.js`.
Expected: all pass — they press `[data-prompt-yes]`/`[data-prompt-no]`, which is what proves the
card's markers and its two answers survived the move.

```bash
git add src/ui/floating/question_card.ts src/ui/prompt.ts
git commit -m "refactor(prompt): the question card owns the answer protocol"
```

---

### Task 10: the image card on the question card

**Files:**
- Modify: `src/ui/image/image_dialog.ts`

**Interfaces:**
- Consumes: `QuestionCard<string | null>` — the name the reader accepted, or null for a cancel,
  which is also Escape's answer. `choose(request)` keeps its signature and its `ImageChooser` port.

- [ ] **Step 1: Move it onto the kind**

`ImageDialog extends QuestionCard<string | null>` with `cautious()` returning `null`. `choose()`
builds its content into `this.card` (the preview, the folder line, the name field, the complaint and
the two buttons) and answers through `askWith`. Its own `answer` field, guard, `settle`, Escape
listener, veil classes and body-mounting go. Every marker stays: `data-image-dialog`,
`data-image-preview`, `data-image-where`, `data-image-name`, `data-image-complaint`,
`data-image-save`, `data-image-cancel`.

- [ ] **Step 2: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run: `npm run probe -- --with-workspace test/probes/insert-image-blob.js`, then `insert-image.js`.
Expected: both pass — the card still draws the picture, still refuses a name the rule refuses, and
Escape still means no image.

```bash
git add src/ui/image/image_dialog.ts
git commit -m "refactor(image): the insert card is a question card"
```

---

### Task 11: the new-note card on the question card

**Files:**
- Modify: `src/ui/new_document/new_document_dialog.ts`

**Interfaces:**
- Consumes: `QuestionCard<NewDocumentPlacement | null>` with `cautious()` returning `null`;
  `choose(request)` keeps its signature and its `NewDocumentChooser` port.

- [ ] **Step 1: Move it onto the kind**

`NewDocumentDialog extends QuestionCard<NewDocumentPlacement | null>`, with the folder list, the name
field and the create button built into `this.card`; its answer field, guard, `settle`, Escape
listener, veil classes and body-mounting go. Every marker stays: `data-new-document`,
`data-new-document-folders`, `data-new-document-folder`, `data-new-document-name`,
`data-new-document-create`, `data-new-document-cancel`.

- [ ] **Step 2: Verify, then commit**

Run: `npx tsc --noEmit && npm run check`
Expected: silent, every check passes.

Run: `npm run probe -- --with-workspace test/probes/new-markdown.js`, then `new-note-template.js`.
Expected: both pass — the card still lists the workspace's folders with the reader's own chosen, and
Escape still writes nothing.

```bash
git add src/ui/new_document/new_document_dialog.ts
git commit -m "refactor(new-note): the card is a question card"
```

---

### Task 12: the guides

**Files:**
- Modify: `docs/ai-context.md`, `docs/architecture.md`, `docs/roadmap.md`, `test/README.md`

**Interfaces:** none — this is the record the next reader needs.

- [ ] **Step 1: Write the four passages**

- `docs/ai-context.md`: a paragraph naming the family and its four classes, the rule that a card
  floats beside what it is about and lands in the corner when it names nothing, and that a message's
  place travels as a *name* because the event bus is Tauri's and its payload is JSON. Say that the
  toast is gone and that `installMessages()` replaced it.
- `docs/architecture.md`: the extension-point row for a floating surface (the four classes, who is
  in each, the rule that a kind may add to Escape and never replace it, and the constraint that a
  panel stays inside its `relative` host), and a "where does this change go?" row for a message
  (`services/messages.ts` for what it is and where it goes, `ui/messages.ts` for what draws it).
- `docs/roadmap.md`: a Closed entry — the toast replaced by messages beside what they are about, the
  family extracted from three idioms, and the three hard-coded English confirmations that moved into
  the catalogues — with `npm run check`'s number and the probe that holds it.
- `test/README.md`: the rows for `check-placement.mjs` and `check-messages.mjs`, the new
  `message-popover` probe, and the probe count.

- [ ] **Step 2: Verify and commit**

Run: `npm run check`
Expected: every check passes.

```bash
git add docs test/README.md
git commit -m "docs: the floating family, and the messages on it"
```

---

## Self-review

Against the spec, section by section:

- **§1 the family** — Tasks 1–2 (base and `BesideCard`), 8 (`AnchoredPanel`), 9 (`QuestionCard`),
  with the marker table as a global constraint and every migration's step naming the probes that
  hold it.
- **§2 the placement rule** — Task 1 owns the arithmetic and its check; Task 2 the mounting rule and
  the pointer policy; Tasks 6 and 7 move the two existing callers onto it, and Task 7 also moves
  `boxOf` to one home.
- **§3 the messages** — Tasks 3 (event, types, `placeSelector`, `notify`), 4 (the surface, the
  catalogues, the rename, the toast's removal) and 5 (the probe). The corner is
  `besidePlacement`'s null anchor.
- **§4 who says where** — Task 4, Step 2, caller by caller, including the image button's
  `data-command`.
- **§5 the question cards** — Tasks 9, 10, 11; the native hands are untouched, as the spec says.
- **§6 the migration, four steps** — the spec's step 1 is Tasks 1–5, step 2 is Tasks 6–7, step 3 is
  Task 8, step 4 is Tasks 9–11; Task 12 is the record. Each ends green and committed.
- **Testing** — the two Node checks (Tasks 1, 3), the probe (Task 5), and the existing probes named
  in every migration task.

Placeholder scan: every step that writes code carries the code; the helpers Task 2 and Task 4 name
(`boxOf`, `boxOfPlace`, `samePlace`, `forget`) are written out in full, and no task refers to a type
or a function another task does not define. `CompletionAnchor` and the two `place()` methods are
named as things this plan deletes, which is the only place they appear.
