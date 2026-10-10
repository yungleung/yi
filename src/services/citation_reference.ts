/**
 * Which works a citation asks a reference for.
 *
 * A citation names its works by key, and the card that shows what a key stands for
 * (`ui/markdown/citation_preview.ts`) asks the bibliography for each of them. This is the rule in
 * front of that call: the keys the citation names, each once, and only the ones the library holds —
 * because a key the library does not hold is a key citation-js refuses to format (it throws, which
 * is why the in-text formatting leaves such a source raw), so it is a work with nothing to show
 * rather than an error, and a citation that names the same work twice asks for one reference.
 *
 * The order it returns is the citation's own; the *printed* order is the CSL style's, which sorts
 * what it is given (APA alphabetically, Vancouver by citation order).
 *
 * May import: the citation parser (`citations/parse.ts`), and nothing else — whether the library
 * holds a key is handed in, so the rule is checked in Node. Upholds: one answer to "which works
 * does this citation stand for", so the card and the formatter cannot disagree.
 */

import { parseCitation } from '../citations/parse';

/** The works `value` cites that `holds` recognises, in the order the citation names them. */
export function referenceIds(value: string, holds: (id: string) => boolean): string[] {
  const ids: string[] = [];
  for (const item of parseCitation(value).items) {
    if (holds(item.id) && !ids.includes(item.id)) {
      ids.push(item.id);
    }
  }
  return ids;
}
