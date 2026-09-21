import { documentManager } from '../../../services/document_manager';
import type { AstWikilink } from '../ast';
import { onNearViewport } from '../lazy';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-wikilink-source';

/**
 * Renders a wikilink as its display text: the explicit title for
 * `[[filename|title]]`, or the target document's title for `[[filename]]`
 * (the frontmatter `title` key, falling back to its heading 1, and finally to
 * the target when the document cannot be resolved). Clicking enters the raw
 * markdown with the caret at the end of its content.
 */
export class Wikilink extends RevealableNodeComponent {
  constructor(node: AstWikilink) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wikilinkRange);
    super('wikilink', node, sourceView ?? document.createElement('span'), sourceView ? '' : 'markdown-wikilink');
    if (sourceView) {
      return;
    }
    const parsed = parseWikilinkValue(node.value);
    this.element.textContent = parsed.title ?? parsed.target;

    if (!parsed.title) {
      // Resolve the target's title only when the wikilink approaches the
      // viewport, so off-screen wikilinks don't trigger document lookups.
      onNearViewport(this.element, () => {
        void documentManager.getTitle(parsed.target).then((title) => {
          if (title && this.element.isConnected) {
            this.element.textContent = title;
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

function parseWikilinkValue(value: string): { target: string; title: string | null } {
  const inner = value.slice(2, -2);
  const separator = inner.indexOf('|');
  if (separator >= 0) {
    const target = inner.slice(0, separator).trim();
    const title = inner.slice(separator + 1).trim();
    return { target, title: title || null };
  }
  return { target: inner.trim(), title: null };
}
