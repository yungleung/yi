/**
 * A frontmatter block's source, highlighted for the block that shows it.
 *
 * A frontmatter block is its own source in every state — there is no view of it to
 * switch to — so the highlighting is what tells a key from its value, the way a fenced
 * code block's does.
 *
 * May import: highlight.js and nothing else. Upholds: markup must not change the text —
 * a caret inside the block is placed by character offset over its own characters, so
 * every character and every space has to survive the highlighting exactly; failing that,
 * the plain source is shown.
 */

import hljs from 'highlight.js';

/** The block's markup, in the language its delimiter gave it. */
export function highlightFrontmatter(source: string, format: 'yaml' | 'toml'): string {
  try {
    return hljs.highlight(source, { language: format, ignoreIllegals: true }).value;
  } catch {
    // Not a failure worth losing the block over: the characters are the point, and the
    // markup only decorates them.
    return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
