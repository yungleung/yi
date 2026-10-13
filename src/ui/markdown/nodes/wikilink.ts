/**
 * Renders a wikilink as its display text: the explicit title for
 * `[[filename|title]]`, or the target document's title for `[[filename]]` (the
 * frontmatter `title` key, falling back to its heading 1, and finally to the
 * target when the document cannot be resolved). Clicking enters the raw markdown.
 *
 * May import: the revealable contract (`revealable_node.ts`), the render context (`render_context.ts`,
 * which hands in a target's title), the viewport observer (`lazy.ts`) and the AST
 * types. Upholds: the source view is built from the node's own markdown, so the
 * link shows its source while the caret is inside it and renders itself otherwise.
 */

import type { AstWikilink } from '../ast';
import { onNearViewport } from '../lazy';
import { renderContext } from '../render_context';
import { wikilinkParts, wikilinkText } from '../syntax/wikilink_text';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-wikilink-source';

export class Wikilink extends RevealableNodeComponent {
  constructor(node: AstWikilink) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wikilinkRange);
    super('wikilink', node, sourceView ?? document.createElement('span'), sourceView ? '' : 'markdown-wikilink');
    if (sourceView) {
      return;
    }
    const parts = wikilinkParts(node.value);
    this.element.textContent = wikilinkText(parts, null);
    // The target travels with the element it rendered: a click cannot read it out of the title
    // (which is another document's, and may be a title the target's file no longer answers to),
    // so whoever asks for the document the link names reads it here (`click_routing.ts:
    // routeWikilinkClick`). A name, not an offset — the source shape shows the characters
    // themselves and carries none of this.
    this.element.dataset.wikilinkTarget = parts.target;

    if (!parts.title) {
      // Resolve the target's title only when the wikilink approaches the
      // viewport, so off-screen wikilinks don't trigger document lookups.
      // The answers are captured now: the lookup runs after the render pass.
      const app = renderContext();
      onNearViewport(this.element, () => {
        void app.wikilinkTitle(parts.target).then((title) => {
          if (title && this.element.isConnected) {
            this.element.textContent = wikilinkText(parts, title);
          }
        });
      });
    }
  }

  /** The target/title between the `[[` and `]]` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return wikilinkRange(source);
  }
}

/** The target/title between the `[[` and `]]` markers. */
function wikilinkRange(source: string): { start: number; end: number } {
  return { start: 2, end: Math.max(2, source.length - 2) };
}
