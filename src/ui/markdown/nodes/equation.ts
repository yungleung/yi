/**
 * Renders one labeled equation and opens its complete source on click.
 *
 * KaTeX cannot name a character inside its output. A click therefore enters
 * the source at the formula body's end, while the block itself is rebuilt with
 * `[$$`, `$$]`, and the attributes visible.
 *
 * May import: the editable node contract, the equation source model, source
 * mode, and KaTeX rendering. Upholds: the rendered number is chrome and the
 * source remains the only editable text.
 */

import type { AstNode } from '../ast';
import type { BlockNode } from '../document/blocks';
import { enterSourceOf } from '../source_mode';
import type { EquationBlockSource } from '../syntax/equation_blocks';
import { EditableNodeComponent } from './editable_node';
import { renderKatexHtml } from './math';

export class Equation extends EditableNodeComponent {
  private readonly bodyEnd: number;

  constructor(block: BlockNode, source: EquationBlockSource, math: string) {
    super(
      'equation',
      block as unknown as AstNode,
      document.createElement('div'),
      'markdown-equation-view markdown-display-math overflow-x-auto'
    );
    this.bodyEnd = entryOffset(source);
    this.element.innerHTML = renderKatexHtml(math, true);
  }

  override placeCaretAt(): void {
    enterSourceOf(this.element, this.bodyEnd);
  }
}

/** The end of the environment's last content line, or the plain formula's end. */
function entryOffset(source: EquationBlockSource): number {
  const environment = source.body.environment;
  if (environment === null) {
    return source.mathTo;
  }
  const closing = `\\end{${environment}${source.body.starred ? '*' : ''}}`;
  const at = source.math.lastIndexOf(closing);
  if (at < 0) {
    return source.mathTo;
  }
  let end = at;
  while (end > 0 && /\s/.test(source.math[end - 1] ?? '')) {
    end -= 1;
  }
  return source.mathFrom + end;
}
