/**
 * The LaTeX source of a formula, highlighted for the span that shows it while
 * the author edits it.
 *
 * May import: highlight.js and its LaTeX grammar, nothing else. Upholds: markup
 * must not change the text — the caret inside a revealed source is placed by
 * character offset over that span's text, so every character and every space has
 * to survive the highlighting exactly; failing that, the plain source is shown.
 */

import hljs from 'highlight.js/lib/core';
import latex from 'highlight.js/lib/languages/latex';

let registered = false;

export function highlightLatex(source: string): string {
  if (!registered) {
    // highlight.js ships LaTeX outside its common set, so it is registered
    // here once rather than pulled in by the code-block renderer.
    hljs.registerLanguage('latex', latex);
    registered = true;
  }
  try {
    return hljs.highlight(source, { language: 'latex', ignoreIllegals: true }).value;
  } catch {
    return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
