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
 * because the system composes only into a field it can see.
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
   * Hands the field the keyboard again — after an edit, and after a click that placed the
   * caret. Both cost the field its input context: the next word would never compose, and
   * after a click the *first letter* of it is delivered as a Latin keystroke instead
   * (measured: `nihao` came out `ni` and 好 — see `markdown_editor.ts`). So the seam takes
   * it back once the turn is over. A selection the edit left showing is kept: a focus
   * change would drop it.
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
  host.appendChild(element);

  let composing = false;
  /** When the last composition committed, so the space that chose it is told from an ordinary one. */
  let committedAt = 0;
  // The composing text is written into the line at the caret, and the block it lands in has
  // to be measured again — a longer word can wrap the line (see `composition_view.ts`).
  const view = createCompositionView(onLayoutChanged);

  /** Takes the value the system left and hands it over; an empty one commits nothing. */
  const commit = () => {
    const text = element.value;
    element.value = '';
    // Marked text stops being marked here, whether it committed a word or was cancelled.
    view.hide();
    if (text === '') {
      return;
    }
    onCommit(text);
  };

  /** Where the caret is, which is where the seam sits and the candidate window opens. */
  const caretBox = () => {
    const range = getCaretRange();
    return range ? caretRect(range) : null;
  };

  /** Draws what the method has marked so far, at the caret it is being written at. */
  const drawMarked = (): void => {
    view.show(element.value, getCaretRange());
  };

  element.addEventListener('compositionstart', () => {
    composing = true;
    drawMarked();
  });
  element.addEventListener('compositionupdate', () => {
    drawMarked();
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
      drawMarked();
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

  /**
   * Puts the keyboard back where the caret is — a turn later, never in the same one.
   *
   * Two moments need it, and they are one fact. An *edit* costs the field its input
   * context, so the next word would never compose. A *click that places the caret* leaves
   * the keyboard on the page — the browser focuses the focusable prose root on mousedown,
   * and the hand-over above stands back for the reader's gesture — so the first letter
   * typed after that click is delivered to the page's own key path and goes into the
   * document as a Latin character, with the composition only beginning with the second
   * one (measured: `nihao` came out `ni` and 好, so the word could not be written).
   *
   * A control of the app's keeps its own keyboard, and a selection the reader is showing is
   * kept — a focus change would drop it. A field that has just lost the keyboard does not
   * compose again if it takes it back inside the same turn, which is why the focus is
   * raised on the next frame.
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

  /** Where the system should open its candidate window: the caret's own box. */
  const followCaret = () => {
    const box = caretBox();
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
    regainKeyboard
  };
}
