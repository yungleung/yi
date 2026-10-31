/**
 * The ordered remark pipelines shared by whole-block parsing and fragment repair.
 *
 * Example: `parseMarkdown` calls `createParseProcessor(remarkDeflistCompat)` so
 * deflist compatibility runs before `remarkDeflist`; caption inline Markdown uses
 * `fragmentProcessor`, which deliberately omits directives and callouts.
 *
 * May import: unified and the remark plugins that define the editor's Markdown.
 * Upholds: the plugin order is declared once, and a fragment is parsed with the
 * same syntax extensions that render it in a complete block.
 */

import { unified } from 'unified';
import type { Root } from 'mdast';
import remarkDeflist from 'remark-deflist';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { remarkAutoReferences } from '../plugins/remark-auto-references';
import { remarkCallouts } from '../plugins/remark-callouts';
import { remarkCitation } from '../plugins/remark-citation/index';
import { remarkHeadingAttributes } from '../plugins/remark-heading-attributes';
import { remarkWikilink } from '../plugins/remark-wikilink/index';

/** The complete Markdown pipeline, including the supplied deflist compatibility rule. */
export function createParseProcessor(
  deflistCompat: () => (tree: Root) => void
) {
  return unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkCallouts)
    .use(deflistCompat)
    .use(remarkDeflist)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkCitation)
    .use(remarkAutoReferences)
    .use(remarkHeadingAttributes)
    .use(remarkWikilink);
}

/** The pipeline for one caption or description-list fragment. */
export const fragmentProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDeflist)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkCitation)
  .use(remarkAutoReferences)
  .use(remarkHeadingAttributes)
  .use(remarkWikilink);
