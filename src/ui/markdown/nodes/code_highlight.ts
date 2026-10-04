/**
 * Highlighted markup for a piece of code, in the language a fence named.
 *
 * One home for what highlight.js is asked and what is done with its answer: a fenced block's body
 * and an indented block's code both come here, so the two can never drift apart. Auto-detection is
 * the fallback for code whose fence named no language — which is what it is for, and the reason the
 * reader is offered the whole language list rather than a short one.
 *
 * May import: highlight.js. Upholds: the markup decorates the text and never changes a character of
 * it — a caret inside the block is placed by character offset over the block's own characters, so
 * every one of them, and every space, has to survive.
 */

import hljs from 'highlight.js';

export function highlightCode(source: string, language = ''): string {
  try {
    return language !== '' && hljs.getLanguage(language)
      ? hljs.highlight(source, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(source).value;
  } catch {
    // Not a failure worth losing the block over: the characters are the point, and the markup only
    // decorates them.
    return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
