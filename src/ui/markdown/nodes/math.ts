import katex from 'katex';
import type { InlineMath as InlineMathNode, Math as MathNode } from 'mdast-util-math';
import type { RootContent } from 'mdast';
import { serializeMarkdown } from '../parser';
import { RevealableNodeComponent } from './revealable_node';

function renderKatex(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    output: 'html'
  });
}

/**
 * Renders an `inlineMath` node with KaTeX. Clicking reveals the raw `$…$`
 * source with the caret at the end; the rendered math returns when the caret
 * moves away.
 */
export class InlineMath extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-math-source';

  constructor(node: InlineMathNode) {
    super('inlineMath', node, document.createElement('span'), 'mx-1 align-middle');
    try {
      this.element.innerHTML = renderKatex(node.value, false);
    } catch {
      this.element.textContent = node.value;
    }
  }

  /** The formula between the `$` markers. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return { start: 1, end: Math.max(1, source.length - 1) };
  }
}

/**
 * Renders a display `math` node with KaTeX. Clicking reveals the raw `$$…$$`
 * source (which may span multiple lines); the caret is placed at the end of
 * the source line nearest the clicked position.
 */
export class DisplayMath extends RevealableNodeComponent {
  protected readonly sourceClassName = 'markdown-math-source';

  constructor(node: MathNode) {
    super('math', node, document.createElement('div'), 'my-4 overflow-x-auto');
    try {
      this.element.innerHTML = renderKatex(node.value, true);
    } catch {
      this.element.textContent = node.value;
    }
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
