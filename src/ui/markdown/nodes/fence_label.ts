/**
 * What a fenced block is called, in its own top-right corner.
 *
 * A fenced block renders its body with the delimiters hidden while the caret is elsewhere
 * (`nodes/fence_text.ts`), so what the block *is* — a frontmatter block and its format, a fenced
 * code block and its language, a display formula — is not readable from the body alone. The label
 * says it, in both shapes of the block.
 *
 * It floats over the block's own box rather than sitting in the flow, so no block's height changes
 * for it and nothing has to be measured again; the offset it hangs from is the block container's,
 * which is positioned (`styles.css`). Its text is marked `data-chrome`, so the offsets mapping
 * steps over it instead of counting it among the block's own characters (`caret/offsets.ts`).
 *
 * A fenced code block's label is a **button**: the language is the one thing about such a block the
 * reader may want to change, and pressing it asks (`language_picker.ts`). Its click is its own — it
 * is not a click in the text, so it neither places the caret nor opens a node's source.
 *
 * May import: nothing but the DOM. Upholds: the label is not the block's text — it is marked so
 * every reader of the block's characters skips it — and it never changes the block's layout.
 */

export interface FenceLabelOptions {
  /** What it says: `YAML Frontmatter`, `latex`, a language, `text` for a fence that names none. */
  readonly text: string;
  /** Whether it is a button, and what pressing it asks for. A badge without this is plain text. */
  readonly onChoose?: (label: HTMLElement) => void;
}

/** The label for a fenced block: a button when there is something to choose, a badge otherwise. */
export function fenceLabel(options: FenceLabelOptions): HTMLElement {
  const button = options.onChoose !== undefined;
  const element = document.createElement(button ? 'button' : 'span');
  element.className = 'markdown-fence-label';
  element.setAttribute('data-chrome', '');
  element.textContent = options.text;
  if (button) {
    (element as HTMLButtonElement).type = 'button';
    element.addEventListener('click', (event) => {
      // The reader pressed the label, not the page under it: no caret, no source, no dismissal
      // of anything that was open.
      event.preventDefault();
      event.stopPropagation();
      options.onChoose?.(element);
    });
  } else {
    // A badge is not a control, but a press on it is still not a press in the text: the caret stays
    // exactly where the reader had it.
    element.addEventListener('click', (event) => event.stopPropagation());
  }
  return element;
}
