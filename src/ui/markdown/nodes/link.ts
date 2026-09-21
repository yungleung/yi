import { appendChildren } from '../registry';
import type { AstLink } from '../ast';
import { enterSourceOf } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-link-source';

/**
 * Renders a `link` node. Clicking a regular link enters its markdown source;
 * autolinks keep normal caret behavior.
 */
export class Link extends RevealableNodeComponent {
  constructor(node: AstLink) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, titleRange);
    super('link', node, sourceView ?? document.createElement('a'), sourceView ? '' : 'markdown-link');
    if (sourceView) {
      return;
    }
    const anchor = this.element as HTMLAnchorElement;
    anchor.href = node.url || '#';
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    anchor.addEventListener('click', (event) => event.preventDefault());
    appendChildren(this.element, node.children);

    // Intercept clicks in the capture phase, before child text components
    // (which stop propagation), so the whole link enters its source.
    // Autolinks fall through to the normal caret behavior.
    this.element.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (!this.shouldReveal()) {
          return;
        }
        event.stopPropagation();
        enterSourceOf(this.element, this.entryOffset());
        const root = this.element.closest('.prose') as HTMLElement | null;
        root?.focus({ preventScroll: true });
      },
      true
    );
  }

  /** Autolinks render as plain URLs with no source to reveal. */
  protected override shouldReveal(): boolean {
    return !isAutolink(this.node as AstLink);
  }

  /** The title between the `[` and `]` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return titleRange(source);
  }
}

/** The title between the `[` and `]` markers. */
function titleRange(source: string): { start: number; end: number } {
  return { start: 1, end: Math.max(1, source.lastIndexOf(']')) };
}

/**
 * Autolinks (`<url>` or GFM `https://…` literals) render as plain URLs with no
 * meaningful source to reveal. A link is treated as an autolink when its single
 * text child equals the URL, allowing for the scheme prefixes the parser
 * normalizes (`www.` → `http://`, `name@host` → `mailto:`).
 */
function isAutolink(node: AstLink): boolean {
  const child = node.children.length === 1 ? node.children[0] : null;
  if (child?.type !== 'text') {
    return false;
  }
  return (
    child.value === node.url ||
    child.value === node.url.replace(/^(?:mailto:|http:\/\/)/, '')
  );
}
