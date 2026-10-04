/**
 * The word being composed, as the reader sees it: the marked text an input method is
 * holding — pinyin, romaji on its way to kana, a hangul syllable — drawn in the page's
 * own type at the caret, underlined, until the word commits.
 *
 * None of these characters is in the document, and a block's rendering is a function of
 * its own source, so this is nothing the renderer draws: it is a surface the editing
 * layer owns, like the caret. It lives inside the page — which is where the page's own
 * type and scale are — and is positioned from the caret's own box, the same measurement
 * the seam (`composition_input.ts`) follows. What it draws is whatever the seam holds,
 * so it knows nothing about any language.
 *
 * May import: the caret's look (`caret/caret.ts: setCaretBarVisible`). Upholds: the
 * document text is the only source of truth — this draws characters the document does
 * not hold yet, and nothing is ever read back out of it.
 */

import { setCaretBarVisible } from '../caret/caret';

/** Where the composing text stands in for the caret, in viewport coordinates. */
export interface ComposeBox {
  left: number;
  top: number;
  /** The height of the line it is written on. */
  height: number;
}

/** What the reader sees of a word being composed. */
export interface CompositionView {
  /** Draws this marked text at the caret; empty text draws nothing at all. */
  show(text: string, box: ComposeBox): void;
  /** Moves it with the caret — a scroll, a layout change — without changing the text. */
  place(box: ComposeBox): void;
  /** Takes it away, and gives the caret's bar back. */
  hide(): void;
}

/**
 * Makes the view, which draws in `host` (the scroller). The page is replaced whenever
 * the document is rendered again, so the element attaches itself when it is *shown*
 * rather than when it is made.
 */
export function createCompositionView(host: HTMLElement): CompositionView {
  const element = document.createElement('span');
  element.className = 'markdown-composition-view';
  element.setAttribute('aria-hidden', 'true');
  let shown = false;

  const move = (box: ComposeBox): void => {
    element.style.left = `${box.left}px`;
    element.style.top = `${box.top}px`;
    element.style.lineHeight = `${box.height}px`;
  };

  const hide = (): void => {
    if (!shown) {
      return;
    }
    shown = false;
    element.classList.remove('markdown-composing');
    element.textContent = '';
    setCaretBarVisible(true);
  };

  return {
    show(text, box) {
      if (text === '') {
        hide();
        return;
      }
      const page = host.querySelector<HTMLElement>('.markdown-page') ?? host;
      if (element.parentElement !== page) {
        page.appendChild(element);
      }
      element.textContent = text;
      move(box);
      element.classList.add('markdown-composing');
      shown = true;
      setCaretBarVisible(false);
    },
    place(box) {
      if (shown) {
        move(box);
      }
    },
    hide
  };
}
