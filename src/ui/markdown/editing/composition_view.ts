/**
 * The word being composed, as the reader sees it: the marked text an input method is
 * holding — pinyin, romaji on its way to kana, a hangul syllable — written into the line
 * where the caret is, so the words after it move along exactly as they do in a system text
 * field, and taken out again when the word commits.
 *
 * None of these characters is in the document, and a block's rendering is a function of its
 * own source, so this is a surface the editing layer owns: a span put into the flow at the
 * caret (`composition_input.ts`), marked `data-composing` so the offsets mapping steps over
 * it (`caret/offsets.ts: textOffsetInElement`), and taken out before anything is written.
 * The block it sits in is one the renderer hands to another block when it leaves the window,
 * which is why the span is removed by *node* — `hide` takes it out wherever it ended up —
 * and why the text node it was cut out of is joined again. What it draws is whatever the
 * seam holds, so it knows nothing about any language.
 *
 * May import: the caret's look (`caret/caret.ts: setCaretBarVisible`). Upholds: the document
 * text is the only source of truth — the composing text is put into the flow to be *seen*,
 * nothing is ever read back out of it, and the block holds exactly the characters it held
 * before once the word commits.
 */

import { setCaretBarVisible } from '../caret/caret';

/** What the editor gives the view: the block whose height may have moved. */
export type LayoutChanged = (block: HTMLElement) => void;

/** What the reader sees of a word being composed. */
export interface CompositionView {
  /** Writes this marked text into the line at `range`; empty text takes it away. */
  show(text: string, range: Range | null): void;
  /** Takes it away, and gives the caret's bar back. */
  hide(): void;
}

/**
 * Makes the view. The span is made once and reused for a word: the system sends a
 * `compositionupdate` per letter, and rebuilding the element on each one would throw a DOM
 * node away and make a new one under the reader's eyes.
 */
export function createCompositionView(layoutChanged: LayoutChanged): CompositionView {
  let span: HTMLSpanElement | null = null;
  let block: HTMLElement | null = null;

  /**
   * Puts the span into the flow at the caret: after the caret's own characters and before
   * the ones that follow, which is where a system text field writes the word being composed.
   */
  const insertAt = (range: Range): boolean => {
    const container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container as Text;
      const rest = text.splitText(Math.min(Math.max(0, range.startOffset), text.data.length));
      rest.parentNode?.insertBefore(span!, rest);
      return true;
    }
    if (container.nodeType === Node.ELEMENT_NODE) {
      const element = container as Element;
      const index = Math.min(Math.max(0, range.startOffset), element.childNodes.length);
      element.insertBefore(span!, element.childNodes[index] ?? null);
      return true;
    }
    return false;
  };

  /** Takes the span out of the DOM, joining the text it was cut out of. */
  const detach = (): void => {
    if (!span) {
      return;
    }
    // The text node the word was cut out of is joined again, so the block holds exactly the
    // characters it held before: the offsets, the tags and the renderer's record of the
    // element are all read off that DOM.
    const parent = span.parentNode;
    span.remove();
    if (parent instanceof Element) {
      parent.normalize();
    }
  };

  const hide = (): void => {
    if (!span) {
      return;
    }
    detach();
    span = null;
    setCaretBarVisible(true);
    if (block) {
      layoutChanged(block);
      block = null;
    }
  };

  return {
    show(text, range) {
      if (text === '' || range === null) {
        hide();
        return;
      }
      if (!span) {
        span = document.createElement('span');
        span.className = 'markdown-composing-inline';
        span.setAttribute('data-composing', '');
        span.setAttribute('aria-hidden', 'true');
      }
      // Where the caret is now: the block the word was in may have left the window and been
      // kept by the renderer for another block (`keepSpare`), and the *same* span is moved
      // out of it rather than a second one being made — a word left in a spare comes back
      // into the page with the block it was left in.
      if (!span.isConnected) {
        detach();
        if (!insertAt(range)) {
          return;
        }
      }
      span.textContent = text;
      block = span.closest<HTMLElement>('.markdown-block');
      setCaretBarVisible(false);
      // A longer word can wrap the line where it did not wrap before, so the block is
      // measured again and the spacers under it move with it
      // (`virtual_block_renderer.ts: measureEditedBlock`).
      if (block) {
        layoutChanged(block);
      }
    },
    hide
  };
}
