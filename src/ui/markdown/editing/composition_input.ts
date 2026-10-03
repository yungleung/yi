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
 * May import: the caret (`caret/caret.ts`, `caret/geometry.ts`). Upholds: the document
 * text is the only source of truth — nothing is written while a word is being
 * composed, and what commits is the system's own text, once.
 */

import { getCaretRange, onCaretRangeChanged } from '../caret/caret';
import { caretRect } from '../caret/geometry';

/** What the editor holds while the seam's element is in the DOM. */
export interface CompositionInput {
  /** The element that holds the keyboard. The editor focuses it, and nothing else may. */
  readonly element: HTMLTextAreaElement;
  /**
   * Hands the field the keyboard again after an edit. Committing and typing are edits, and
   * an edit costs the field its input context — the next word would never compose — so the
   * seam takes it back once the turn is over. A selection the edit left showing is kept:
   * a focus change would drop it.
   */
  regainKeyboard(): void;
}

/** The controls whose focus is their own: a field of the app's, never the page's. */
const CONTROLS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Puts the seam in `host` (the scroller) and reports what committed.
 *
 * The element is parked off to the side until there is a caret to sit on, and follows
 * the caret from then on — a caret change and a scroll both move it, because the
 * system's candidate window opens where the element is.
 */
export function installCompositionInput(
  host: HTMLElement,
  onCommit: (text: string) => void
): CompositionInput {
  const element = document.createElement('textarea');
  element.className = 'markdown-composition-input';
  element.setAttribute('tabindex', '-1');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('autocapitalize', 'off');
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('spellcheck', 'false');
  host.appendChild(element);

  let composing = false;
  /** When the last composition committed, so the space that chose it is told from an ordinary one. */
  let committedAt = 0;

  /** Takes the value the system left and hands it over; an empty one commits nothing. */
  const commit = () => {
    const text = element.value;
    element.value = '';
    if (text === '') {
      return;
    }
    onCommit(text);
  };

  element.addEventListener('compositionstart', () => {
    composing = true;
  });
  element.addEventListener('compositionend', () => {
    composing = false;
    committedAt = performance.now();
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
      return;
    }
    if (element.value === ' ' && performance.now() - committedAt < 50) {
      element.value = '';
      return;
    }
    commit();
  });

  /** Whether the reader is showing a selection — which a focus change would drop. */
  const showingSelection = (): boolean => {
    const selection = window.getSelection();
    return selection !== null && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
  };

  // A pointer that is down means the reader is working with the page itself — dragging
  // over text to select it, most of all — and taking the keyboard out from under that
  // gesture is what cancels it. The hand-over waits for the gesture to be over, or for
  // the click that places a caret (`editing/context.ts: placeCaret` → `focusText`).
  let pointerDown = false;
  host.addEventListener('pointerdown', () => {
    pointerDown = true;
  }, true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
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

  /** Where the system should open its candidate window: the caret's own box. */
  const followCaret = () => {
    const range = getCaretRange();
    const box = range ? caretRect(range) : null;
    if (!box) {
      element.style.left = '-1000px';
      element.style.top = '-1000px';
      return;
    }
    // The seat, not the size: the box's height is the stylesheet's, because the system
    // refuses to compose in one as short as a line of the page's type (see `styles.css`).
    element.style.left = `${box.left}px`;
    element.style.top = `${box.top}px`;
  };
  onCaretRangeChanged(followCaret);
  host.addEventListener('scroll', followCaret);
  followCaret();

  return {
    element,
    regainKeyboard: () => {
      if (showingSelection() || document.activeElement !== element) {
        return;
      }
      // Not in the same turn: the method has to see the change land.
      element.blur();
      requestAnimationFrame(() => element.focus({ preventScroll: true }));
    }
  };
}
