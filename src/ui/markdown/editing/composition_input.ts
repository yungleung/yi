/**
 * The keyboard's way in that is not a keystroke: an input method composing a word,
 * dictation, the emoji panel.
 *
 * The text path reads characters out of `keydown`, which is right for a keyboard that
 * sends one character per key and useless for one that composes. So one invisible
 * textarea sits inside the scroller and holds the keyboard while the editor has the
 * caret: the system composes into it, its events bubble to the listeners the editor
 * already has on the scroller, and every key the editor handles is still
 * `preventDefault`ed — which is what keeps its value empty until the system puts a
 * word there. `compositionend`, and an `input` that is not part of a composition,
 * hand that word to the caller, which writes it into the document as one edit
 * (`text_commands.ts: insertCommitted`).
 *
 * What the method has marked so far is *written into the line* — the pinyin, the kana, the
 * syllable — where the reader is typing it, so the words after it move along the way they
 * do in a system text field (`composition_view.ts`). The field itself stays invisible,
 * because the system composes only into a field it can see: its ink and the caret that takes
 * its colour are transparent, and what the system paints in it besides those — the selection
 * over a marked word — is clipped to the editor's own box (`styles.css`).
 *
 * May import: the caret (`caret/caret.ts`, `caret/geometry.ts`) and that view. Upholds:
 * the document text is the only source of truth — nothing is written while a word is
 * being composed, and what commits is the system's own text, once.
 */

import { getCaretRange, onCaretRangeChanged } from '../caret/caret';
import { caretRect } from '../caret/geometry';
import { createCompositionView } from './composition_view';

/** What the editor holds while the seam's element is in the DOM. */
export interface CompositionInput {
  /** The element that holds the keyboard. The editor focuses it, and nothing else may. */
  readonly element: HTMLTextAreaElement;
  /**
   * Whether the input method is holding a word — composing one now, or having let one go a
   * moment ago. A key that edits *that word* (Backspace) belongs to the method rather than to
   * the editor, and the event cannot be asked: the key that emptied the word arrives with the
   * composition already over and nothing on it to say so (see `markdown_editor.ts`).
   */
  markedText(): boolean;
  /**
   * Keeps the seam focused after ordinary typing without deliberately resetting its input
   * context. A source block used to be rebuilt for every character and then blur/refocus the
   * seam, which lost fast keyboard input.
   */
  keepKeyboard(): void;
  /**
   * Ends a native-input burst before an editor-handled key extends the document.
   * The reset is immediate because the next key can arrive before the next frame.
   */
  settleNativeInput(): void;
  /**
   * Hands the field the keyboard again after a structural edit or a click that placed the
   * caret. Those need a fresh input context: the next word would otherwise never compose, and
   * after a click the *first letter* is delivered as a Latin keystroke instead (measured:
   * `nihao` came out `ni` and 好 — see `markdown_editor.ts`). Ordinary character typing and
   * an in-place committed word use `keepKeyboard` instead, because blurring the seam during a
   * burst loses input. A selection the edit left showing is kept: a focus change would drop it.
   */
  regainKeyboard(): void;
}

/** The controls whose focus is their own: a field of the app's, never the page's. */
const CONTROLS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * How long a composition's own key is still the method's once it has ended: the space that
 * chose a candidate, the Backspace that emptied the word. Both are delivered once more with
 * the composition already over, and neither says whose it is.
 */
const MOMENT_MS = 50;

/**
 * Puts the seam in `host` (the scroller) and reports what committed.
 *
 * The element is parked off to the side until there is a caret to sit on, and follows
 * the caret from then on — a caret change and a scroll both move it, because the
 * system's candidate window opens where the element is. `onCommit` writes a committed word
 * into the document, and `onLayoutChanged` measures the block the composing text was written
 * into again — a longer word can wrap the line (see `composition_view.ts`).
 */
export function installCompositionInput(
  host: HTMLElement,
  onCommit: (text: string) => void,
  onLayoutChanged: (block: HTMLElement) => void
): CompositionInput {
  const element = document.createElement('textarea');
  element.className = 'markdown-composition-input';
  element.setAttribute('tabindex', '-1');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('autocapitalize', 'off');
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('spellcheck', 'false');
  // The field is drawn inside a box the size of the editor (`styles.css`): what the *system*
  // paints in it — the blue of a selected marked word, its caret — is not transparent, and a field
  // taller than the reader's last line would paint it past the editor's bottom edge, over the
  // status bar. WebKit does not honour `::selection` for a textarea's own selection, so clipping
  // the paint is what keeps it unseen. The field itself keeps its size and its place at the caret,
  // which is what the system composes into and where its caret has to be.
  const clip = document.createElement('div');
  clip.className = 'markdown-composition-clip';
  clip.setAttribute('aria-hidden', 'true');
  host.appendChild(clip);
  clip.appendChild(element);

  let composing = false;
  /** When the last composition committed, so the space that chose it is told from an ordinary one. */
  let committedAt = 0;
  /** The part of the field already handed to the document during the current native burst. */
  let committedValue = '';
  /** A deferred clear, so WebKit finishes the input event that produced the text. */
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  /** A 229-routed Latin letter whose Caps Lock form should follow the method's case. */
  let methodLetterLowercase = false;
  /** Whether native text entered the field since the last editor-handled key. */
  let nativeBurstActive = false;
  /**
   * Whether a printable keydown arrived after the last commit. The duplicate space a
   * method sends when choosing a candidate has no such key of its own; the next space
   * the author types does.
   */
  let keyAfterCommit = false;
  // The composing text is written into the line at the caret, and the block it lands in has
  // to be measured again — a longer word can wrap the line (see `composition_view.ts`).
  const view = createCompositionView(onLayoutChanged);

  /** The native text not yet handed to the document. */
  const pendingText = (): string =>
    element.value.startsWith(committedValue)
      ? element.value.slice(committedValue.length)
      : element.value;

  /**
   * Clears the field after the current input event. Clearing it synchronously makes
   * WebKit refuse the next native insertion at the same caret.
   */
  const clearLater = (): void => {
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
    }
    clearTimer = setTimeout(() => {
      clearTimer = null;
      if (composing) {
        return;
      }
      element.value = '';
      committedValue = '';
      methodLetterLowercase = false;
    }, 0);
  };

  /** Takes the new value the system left and hands it over; no new text commits nothing. */
  const commit = (fromInput = false) => {
    const pending = pendingText();
    const text = methodLetterLowercase
      ? pending.replace(/\p{Lu}/gu, (letter) => letter.toLocaleLowerCase())
      : pending;
    committedValue = element.value;
    nativeBurstActive ||= fromInput;
    methodLetterLowercase = false;
    // Marked text stops being marked here, whether it committed a word or was cancelled.
    view.hide();
    if (text === '') {
      clearLater();
      return;
    }
    onCommit(text);
    clearLater();
  };

  /** Where the caret is, which is where the seam sits and the candidate window opens. */
  const caretBox = () => {
    const range = getCaretRange();
    return range ? caretRect(range) : null;
  };

  /** The word the method is holding: being composed now, or let go a moment ago. */
  const markedText = (): boolean => composing || performance.now() - committedAt < MOMENT_MS;

  /** Whether the system is using the field: a composition open, or marked text left in it. */
  const fieldInUse = (): boolean => composing || element.value !== '';

  /** The editor's own box: the frame the field is drawn inside, in viewport coordinates. */
  let frame = { left: 0, top: 0 };

  /**
   * Reads the editor's box — a frame after the seam is made, when the window is resized, and while
   * the system is using the field. Never on the caret path of a plain keystroke: that path must
   * read no layout at all (`test/probes/typed-text.js` counts those), and an earlier version that
   * read here on every caret move is what broke it.
   */
  const measureFrame = (): void => {
    const rect = host.getBoundingClientRect();
    frame = { left: rect.left, top: rect.top };
    clip.style.left = `${rect.left}px`;
    clip.style.top = `${rect.top}px`;
    clip.style.width = `${rect.width}px`;
    clip.style.height = `${rect.height}px`;
  };
  requestAnimationFrame(measureFrame);
  window.addEventListener('resize', measureFrame);

  /** Where the system should open its candidate window: the caret's own box, inside the clip. */
  const followCaret = () => {
    const box = caretBox();
    if (!box) {
      element.style.left = '-1000px';
      element.style.top = '-1000px';
      return;
    }
    if (fieldInUse()) {
      measureFrame();
    }
    element.style.left = `${box.left - frame.left}px`;
    element.style.top = `${box.top - frame.top}px`;
  };

  /** Draws what the method has marked so far, at the caret it is being written at. */
  const drawMarked = (): void => {
    view.show(element.value, getCaretRange());
    // The field has to be where the system will draw that word, and it is only placed again on a
    // caret move otherwise.
    followCaret();
  };

  element.addEventListener('compositionstart', () => {
    composing = true;
    keyAfterCommit = false;
    methodLetterLowercase = false;
    nativeBurstActive = false;
    drawMarked();
  });
  element.addEventListener('compositionupdate', () => {
    drawMarked();
  });
  element.addEventListener('compositionend', () => {
    composing = false;
    committedAt = performance.now();
    keyAfterCommit = false;
    commit();
  });
  // Dictation, the emoji panel and a system autocorrection arrive as an `input` with no
  // composition behind it. Two things are not the author's text, though, and both arrive
  // here rather than through the key path:
  //
  // - the key that *chose* a candidate — a space, in every input method this was tried
  //   with — which comes once more as ordinary text a moment after the commit. Typing it
  //   would leave a space after every Chinese word.
  // - the marked text of a composition whose input method sends no composition events.
  //   Those arrive with `insertCompositionText`, which is exactly how they are told apart.
  element.addEventListener('input', (event) => {
    if (composing || event.inputType === 'insertCompositionText') {
      drawMarked();
      return;
    }
    // The space that chose the candidate, delivered once more as ordinary text: it is the
    // method's key, and typing it would leave a space after every Chinese word.
    if (
      pendingText() === ' ' &&
      performance.now() - committedAt < MOMENT_MS &&
      !keyAfterCommit
    ) {
      // Keep the field editable until the current event is over, but remove this
      // method-owned suffix from what the next event will see.
      element.value = committedValue;
      clearLater();
      return;
    }
    commit(true);
  });

  /** Whether the reader is showing a selection — which a focus change would drop. */
  const showingSelection = (): boolean => {
    const selection = window.getSelection();
    return selection !== null && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
  };

  /**
   * Puts the keyboard back where the caret is — a turn later, never in the same one.
   *
   * A structural edit or a caret moved by a click, undo or arrow needs it: each costs the field
   * its input context, and without a fresh one the first letter of the next word arrived as a
   * Latin keystroke instead of opening a composition (`nihao` came out `ni` and 好). A click
   * also leaves the keyboard on the page because the browser focuses the focusable prose root
   * on mousedown, and the hand-over above stands back for that gesture. Ordinary typed
   * characters and an in-place committed word do not take this path; see `keepKeyboard`.
   *
   * A control of the app's keeps its own keyboard, and a selection the reader is showing is kept
   * — a focus change would drop it. A field that has just lost the keyboard does not compose
   * again if it takes it back inside the same turn, which is why the focus is raised on the next
   * frame.
   */
  const regainKeyboard = (): void => {
    const active = document.activeElement;
    if (active !== element) {
      // Not ours: only the keyboard that is *in the editor* comes back here. A control of
      // the app's — a field in the find bar, a card's own — keeps its own.
      const inEditor = active instanceof Node && host.contains(active);
      if (!inEditor || (active instanceof Element && active.matches(CONTROLS))) {
        return;
      }
    }
    if (showingSelection()) {
      return;
    }
    element.blur();
    requestAnimationFrame(() => element.focus({ preventScroll: true }));
  };

  /** Keeps ordinary character typing in the seam without the deliberate focus reset. */
  const keepKeyboard = (): void => {
    const active = document.activeElement;
    if (active === element) {
      return;
    }
    if (active instanceof Element && active.matches(CONTROLS)) {
      return;
    }
    if (showingSelection()) {
      return;
    }
    requestAnimationFrame(() => element.focus({ preventScroll: true }));
  };

  /** Releases a native burst so its textarea context cannot outlive an editor-handled key. */
  const settleNativeInput = (): void => {
    if (!nativeBurstActive) {
      return;
    }
    if (clearTimer !== null) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    element.value = '';
    committedValue = '';
    methodLetterLowercase = false;
    nativeBurstActive = false;
    element.blur();
    element.focus({ preventScroll: true });
  };

  // A pointer that is down means the reader is working with the page itself — dragging
  // over text to select it, most of all — and taking the keyboard out from under that
  // gesture is what cancels it. The hand-over waits for the gesture to be over, or for
  // the click that places a caret (`editing/context.ts: placeCaret` → `focusText`).
  let pointerDown = false;
  host.addEventListener(
    'keydown',
    (event) => {
      if (
        event.keyCode === 229 &&
        !event.shiftKey &&
        event.key.length === 1 &&
        /\p{L}/u.test(event.key)
      ) {
        methodLetterLowercase = true;
      }
      if (event.key.length === 1 && performance.now() - committedAt < MOMENT_MS) {
        keyAfterCommit = true;
      }
    },
    true
  );
  host.addEventListener('pointerdown', () => {
    pointerDown = true;
  }, true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    // The gesture is over, and the caret it placed is where the keyboard belongs: a click
    // on the page leaves the keyboard *on the page*, and the first letter typed after it is
    // the page's. A drag that selected text is not a caret — `regainKeyboard` keeps it.
    regainKeyboard();
  }, true);

  // The keyboard belongs here whenever it is in the editor: a click that places a caret, a
  // click on a blank line, `focusText` after a mode laid over the editor. A control keeps
  // its own focus, and a gesture in progress keeps the reader's.
  host.addEventListener('focusin', (event) => {
    const target = event.target;
    if (
      target === element ||
      (target instanceof Element && target.matches(CONTROLS)) ||
      pointerDown ||
      showingSelection()
    ) {
      return;
    }
    element.focus({ preventScroll: true });
  });

  onCaretRangeChanged(followCaret);
  host.addEventListener('scroll', followCaret);
  followCaret();

  return {
    element,
    markedText,
    keepKeyboard,
    regainKeyboard,
    settleNativeInput
  };
}
