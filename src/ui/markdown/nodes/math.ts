import katex from 'katex';
import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import type { RootContent } from 'mdast';
import { serializeMarkdown } from '../parser';
import { RevealableNodeComponent } from './revealable_node';
import { onNearViewport } from '../lazy';
import { highlightLatex } from './latex_highlight';

/**
 * Math source is LaTeX, so it is shown highlighted while it is being edited —
 * the display delimiters, the commands and the comments read apart. The markup
 * never changes the text: the caret inside the source is placed by character
 * offset over it.
 */
abstract class MathSource extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-math-source';

  protected override fillSourceView(sourceView: HTMLSpanElement, source: string): void {
    sourceView.innerHTML = highlightLatex(source);
  }
}

/**
 * KaTeX output is a pure function of the source, so render once per unique
 * formula and reuse the HTML. Structural re-renders rebuild every math node,
 * and without this cache each rebuild would re-run KaTeX for the whole
 * document (the dominant cost in math-heavy notes).
 */
const katexCache = new Map<string, string>();

/**
 * A formula's markup if it has been rendered before, or undefined. Nodes apply
 * this immediately: starting a re-mounted block on the raw formula and
 * swapping in the rendering a moment later changes the block's height after
 * the renderer has already measured it, which moves the document's total height
 * and makes the scrollbar re-scale mid-scroll.
 */
export function cachedMath(value: string, displayMode: boolean): string | undefined {
  return katexCache.get(`${displayMode ? 'd' : 'i'}:${value}`);
}

function renderKatex(value: string, displayMode: boolean): string {
  const key = `${displayMode ? 'd' : 'i'}:${value}`;
  const cached = katexCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const html = katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    output: 'html'
  });
  katexCache.set(key, html);
  return html;
}

/** Swaps a math placeholder's raw formula for its KaTeX rendering. */
function renderMathElement(element: HTMLElement): void {
  const value = element.dataset.math ?? '';
  const display = element.dataset.display === 'true';
  try {
    element.innerHTML = renderKatex(value, display);
    element.classList.remove('markdown-math-placeholder');
  } catch {
    // Keep the raw formula as the placeholder when KaTeX fails.
  }
}

/**
 * Renders the formula straight away when it is already cached, and otherwise
 * leaves the raw source as a placeholder until the node approaches the
 * viewport. Skipping the placeholder avoids a height change after measuring.
 */
function renderOrDefer(element: HTMLElement, value: string, display: boolean): void {
  const cached = cachedMath(value, display);
  if (cached !== undefined) {
    element.innerHTML = cached;
    element.classList.remove('markdown-math-placeholder');
    return;
  }
  element.textContent = value;
  onNearViewport(element, () => renderMathElement(element));
}

/**
 * Renders an `inlineMath` node with KaTeX. The raw formula is shown
 * immediately as a cheap placeholder; KaTeX runs only when the node
 * approaches the viewport. Clicking reveals the raw `$…$` source.
 */
export class InlineMath extends MathSource {
  constructor(node: InlineMathNode) {
    super('inlineMath', node, document.createElement('span'), 'mx-1 align-middle');
    this.element.classList.add('markdown-math-placeholder');
    this.element.dataset.math = node.value;
    this.element.dataset.display = 'false';
    renderOrDefer(this.element, node.value, false);
  }

  /** The formula between the `$` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return { start: 1, end: Math.max(1, source.length - 1) };
  }
}

/**
 * Renders a display `math` node with KaTeX. Clicking reveals the raw `$$…$$`
 * source (which may span multiple lines); the caret is placed at the end of
 * the source line nearest the clicked position. The formula renders lazily
 * near the viewport, like inline math.
 */
export class DisplayMath extends MathSource {
  constructor(node: MathNode) {
    super('math', node, document.createElement('div'), 'my-4 overflow-x-auto');
    this.element.classList.add('markdown-math-placeholder');
    this.element.dataset.math = node.value;
    this.element.dataset.display = 'true';
    renderOrDefer(this.element, node.value, true);
  }

  protected override sourceOffsetForClick(_clientX: number, clientY: number): number | undefined {
    return this.sourceLineOffsetAt(clientY);
  }

  /** The formula between the `$$` delimiters (or the whole source without them). */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return {
      start: source.trimStart().startsWith('$$') ? source.indexOf('$$') + 2 : 0,
      end: source.trimEnd().endsWith('$$') ? source.lastIndexOf('$$') : source.length
    };
  }

  /**
   * Maps the click's vertical position to the nearest source line of the
   * display formula, returning the caret offset at the end of that line.
   */
  private sourceLineOffsetAt(clientY: number): number | undefined {
    const source = serializeMarkdown([this.node as RootContent]).trimEnd();
    const lines = source.split('\n');
    if (lines.length <= 1) {
      return undefined;
    }
    const rect = this.element.getBoundingClientRect();
    if (rect.height <= 0) {
      return undefined;
    }

    // The content sits between the `$$` delimiters when present.
    const contentStart = lines[0].trim() === '$$' ? 1 : 0;
    const contentEnd =
      lines.length > 1 && lines[lines.length - 1].trim() === '$$' ? lines.length - 1 : lines.length;
    const contentLines = lines.slice(contentStart, contentEnd);
    if (contentLines.length <= 1) {
      return undefined;
    }

    const ratio = (clientY - rect.top) / rect.height;
    const lineIndex = Math.min(
      contentLines.length - 1,
      Math.max(0, Math.floor(ratio * contentLines.length))
    );
    return lines.slice(0, contentStart + lineIndex + 1).join('\n').length;
  }
}
