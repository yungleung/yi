import { documentManager } from '../../../services/document_manager';
import type { AstWikilink } from '../ast';
import { RevealableNodeComponent } from './revealable_node';
import { onNearViewport } from '../lazy';

/**
 * Renders a wikilink as its display text: the explicit title for
 * `[[filename|title]]`, or the target document's title for `[[filename]]`
 * (the frontmatter `title` key, falling back to its heading 1, and finally to
 * the target when the document cannot be resolved).
 * Clicking reveals the raw markdown with the caret at the end.
 */
export class Wikilink extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-wikilink-source';
  private readonly target: string;
  private readonly explicitTitle: string | null;

  constructor(node: AstWikilink) {
    super('wikilink', node, document.createElement('span'), 'markdown-wikilink');
    const parsed = parseWikilinkValue(node.value);
    this.target = parsed.target;
    this.explicitTitle = parsed.title;
    this.element.textContent = this.explicitTitle ?? this.target;

    if (!this.explicitTitle) {
      // Resolve the target's title only when the wikilink approaches the
      // viewport, so off-screen wikilinks don't trigger document lookups.
      onNearViewport(this.element, () => {
        void documentManager.getTitle(this.target).then((title) => {
          if (title && this.element.isConnected) {
            this.element.textContent = title;
          }
        });
      });
    }
  }

  /** The target/title between the `[[` and `]]` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return { start: 2, end: Math.max(2, source.length - 2) };
  }
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
