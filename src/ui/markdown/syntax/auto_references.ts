/**
 * Finds Yi's textless automatic cross-reference syntax in a text run.
 *
 * `[#id]` is deliberately small enough to live inside ordinary Markdown text:
 * the Markdown parser leaves it as text, and the transformer replaces only the
 * spans this module reports. Escaped openings and empty or unterminated forms
 * remain literal.
 *
 * May import: nothing — the text is passed in. Upholds: one fact about
 * markdown syntax has one home, and this is the home of the reference spelling.
 */

/** One automatic reference in source-relative coordinates. */
export interface AutoReferenceSpan {
  from: number;
  to: number;
  id: string;
}

/** Every non-escaped `[#id]` in `text`, in source order. */
export function autoReferenceSpans(text: string): AutoReferenceSpan[] {
  const spans: AutoReferenceSpan[] = [];
  for (let from = 0; from < text.length - 2; from += 1) {
    if (text[from] !== '[' || text[from + 1] !== '#' || escapedAt(text, from)) {
      continue;
    }
    const close = text.indexOf(']', from + 2);
    if (close < 0) {
      break;
    }
    const id = text.slice(from + 2, close);
    if (id.trim() === '' || /[\s]/.test(id)) {
      continue;
    }
    spans.push({ from, to: close + 1, id });
    from = close;
  }
  return spans;
}

/** Whether the character at `at` is escaped by an odd run of backslashes. */
function escapedAt(text: string, at: number): boolean {
  let slashes = 0;
  for (let index = at - 1; index >= 0 && text[index] === '\\'; index -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}
