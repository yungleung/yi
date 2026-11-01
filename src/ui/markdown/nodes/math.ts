/**
 * Renders inline and display math: KaTeX output for the view, and the formula's
 * own source while the caret is inside it.
 *
 * May import: the node contracts (`editable_node.ts`, `revealable_node.ts`),
 * KaTeX, the LaTeX highlighter (`latex_highlight.ts`), `source_mode.ts`, the
 * viewport observer (`lazy.ts`) and the AST types. Upholds: a rendering is a pure
 * function of its own source — the KaTeX cache is keyed by that source, so a
 * rebuild cannot change what a formula looks like.
 */

import katex from 'katex';
import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import { EditableNodeComponent } from './editable_node';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';
import { enterSourceOf } from '../source_mode';
import { onNearViewport } from '../lazy';
import { highlightLatex } from './latex_highlight';
import {
  readEquationBody,
  unnumberedEquationBody
} from '../syntax/equation';

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

export function renderKatexHtml(value: string, displayMode: boolean): string {
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
    element.innerHTML = renderKatexHtml(value, display);
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
 * approaches the viewport. Clicking reveals the raw `$…$` source, which is
 * LaTeX: showing it highlighted keeps the delimiters and the commands apart,
 * and the markup never changes the text the caret is placed over.
 */
export class InlineMath extends RevealableNodeComponent {
  constructor(node: InlineMathNode) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, formulaRange, (element, source) => {
      element.innerHTML = highlightLatex(source);
    });
    super(
      'inlineMath',
      node,
      sourceView ?? document.createElement('span'),
      sourceView ? '' : 'mx-1 align-middle'
    );
    if (sourceView) {
      return;
    }
    this.element.classList.add('markdown-math-placeholder');
    this.element.dataset.math = node.value;
    this.element.dataset.display = 'false';
    renderOrDefer(this.element, node.value, false);
  }

  /** The formula between the `$` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return formulaRange(source);
  }
}

const SOURCE_CLASS = 'markdown-math-source';

/** The formula between the `$` markers. */
function formulaRange(source: string): { start: number; end: number } {
  return { start: 1, end: Math.max(1, source.length - 1) };
}

/**
 * Renders a display `math` node with KaTeX, and nothing else.
 *
 * A display formula is a block, and KaTeX has no characters to aim a caret at,
 * so the *block* shows its own text — delimiters and all (see `source_mode.ts`
 * and `create_block.ts`) — while the caret is inside it, and this rendering
 * holds no caret of its own: it is what the block shows the rest of the time.
 * The formula renders lazily near the viewport, like inline math.
 */
export class DisplayMath extends EditableNodeComponent {
  constructor(node: MathNode) {
    super('math', node, document.createElement('div'), 'markdown-display-math overflow-x-auto');
    this.element.classList.add('markdown-math-placeholder');
    const math = unnumberedEquationBody(readEquationBody(node.value));
    this.element.dataset.math = math;
    this.element.dataset.display = 'true';
    renderOrDefer(this.element, math, true);
  }

  /**
   * A click on the rendering enters the block's own text, with the caret at
   * the end of the formula's last content line.
   *
   * The rendering cannot name a character — KaTeX's glyphs say nothing about
   * where in the source they were written — so the entry point is the one
   * position that is always true, and the author's next click lands on the
   * text itself, where the mapping is exact.
   */
  override placeCaretAt(): void {
    enterSourceOf(this.element);
  }
}
