/**
 * Renders one equation block as KaTeX with its Yi number, or as exact source.
 *
 * Example: `[$$x$$]{#eq:x}` draws one formula and its number; while edited it draws the complete
 * wrapper source instead.
 *
 * May import: block/equation/node rules and the render context. Upholds: one source range produces
 * one equation view and at most one Yi-owned number.
 */

import type { RootContent } from 'mdast';
import type { BlockNode } from '../document/block';
import { Equation, EquationSource } from '../nodes/equation';
import { renderContext } from '../render_context';
import { isSourceBlock } from '../source_mode';
import type { CalloutSource } from '../syntax/callout';
import {
  innerEquationBody,
  readEquationBlockSource
} from '../syntax/equation';

export function renderEquationBlock(
  node: BlockNode,
  container: (node: BlockNode) => HTMLElement,
  renderParsed: (
    node: BlockNode,
    children: RootContent[],
    callout: CalloutSource | null
  ) => HTMLElement
): HTMLElement {
  const source = readEquationBlockSource(node.text);
  const element = container(node);
  if (source === null) {
    return renderParsed(node, [], null);
  }
  element.classList.add('markdown-equation-block');
  if (source.id !== null) {
    element.id = source.id;
  }
  if (isSourceBlock(node)) {
    element.appendChild(new EquationSource(node).element);
    return element;
  }
  element.appendChild(
    new Equation(node, source, innerEquationBody(source.body)).element
  );
  const numberText = renderContext().equationNumberAt(node.charStart + source.from);
  if (numberText !== null) {
    const number = document.createElement('span');
    number.className = 'markdown-equation-number';
    number.setAttribute('data-chrome', 'true');
    number.textContent = numberText;
    element.appendChild(number);
  }
  return element;
}
