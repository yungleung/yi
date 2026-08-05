import { appendChildren } from './create_node';
import type { MarkdownLink } from './editable_node';
import { RevealableNodeComponent } from './revealable_node';

/**
 * Renders a `link` node. Clicking a regular link reveals its markdown source;
 * autolinks keep normal caret behavior.
 */
export class Link extends RevealableNodeComponent {
  constructor(node: MarkdownLink) {
    super('link', node, document.createElement('a'));
    const anchor = this.element as HTMLAnchorElement;
    anchor.href = node.url || '#';
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    anchor.addEventListener('click', (event) => event.preventDefault());
    appendChildren(this.element, node.children);

    // Intercept clicks in the capture phase, before child text components
    // (which stop propagation), so the whole link reveals its source.
    // Autolinks fall through to the normal caret behavior.
    this.element.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (isAutolink(node) || this.sourceView) {
          return;
        }
        event.stopPropagation();
        this.revealSource('markdown-link-source');
        const root = this.element.closest('.prose') as HTMLElement | null;
        root?.focus({ preventScroll: true });
      },
      true
    );
  }

  override placeCaretAt(clientX: number, clientY: number): void {
    if (isAutolink(this.node as MarkdownLink)) {
      super.placeCaretAt(clientX, clientY);
      return;
    }
    this.revealSource('markdown-link-source');
  }
}

/**
 * Autolinks (`<url>` or GFM `https://…` literals) render as plain URLs with no
 * meaningful source to reveal. A link is treated as an autolink when its single
 * text child equals the URL, allowing for the scheme prefixes the parser
 * normalizes (`www.` → `http://`, `name@host` → `mailto:`).
 */
function isAutolink(node: MarkdownLink): boolean {
  const child = node.children.length === 1 ? node.children[0] : null;
  if (child?.type !== 'text') {
    return false;
  }
  return (
    child.value === node.url ||
    child.value === node.url.replace(/^(?:mailto:|http:\/\/)/, '')
  );
}
