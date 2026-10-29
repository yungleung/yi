/**
 * What families of export share the same source rewriting.
 *
 * May import: nothing. Upholds: every export rule that needs the LaTeX or
 * HTML family asks this module rather than spelling its own kind list.
 */

const LATEX_KINDS = new Set(['latex', 'pdf', 'beamer']);
const HTML_LIKE_KINDS = new Set(['html', 'epub', 'revealjs']);

/** Whether this output is LaTeX and uses native labels and counters. */
export function isLatexKind(kind: string): boolean {
  return LATEX_KINDS.has(kind);
}

/** Whether this output can carry the app's HTML layout markup. */
export function isHtmlLikeKind(kind: string): boolean {
  return HTML_LIKE_KINDS.has(kind);
}
