/**
 * Renders one list caption and reveals its complete source line for editing.
 *
 * The generated number is chrome. The caption's inline Markdown remains the
 * source of its visible text, and the node's own source includes `:`, the
 * caption, and the trailing Pandoc attributes.
 *
 * May import: the revealable-node contract, the registry's child helper, the
 * render context and the list caption node type. Upholds: a click maps through
 * the caption's own document range, never through a list item.
 */

import type { ListCaptionNode } from '../syntax/list_captions';
import { appendChildren } from '../registry';
import { renderContext } from '../render_context';
import { renderingBlock } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-list-caption-source';

export class ListCaption extends RevealableNodeComponent {
  constructor(node: ListCaptionNode) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wholeSource);
    super(
      'listCaption',
      node,
      sourceView ?? document.createElement('div'),
      sourceView ? '' : 'markdown-list-caption'
    );
    if (sourceView) {
      return;
    }
    this.element.setAttribute('role', 'caption');
    const block = renderingBlock();
    const from = block === null ? null : block.charStart + node.listFrom;
    const number = from === null ? null : renderContext().listLabelAt(from);
    if (number !== null) {
      const label = document.createElement('span');
      label.className = 'markdown-list-number';
      label.setAttribute('data-chrome', 'true');
      label.textContent = `${number}.`;
      this.element.appendChild(label);
      if (node.children.length > 0) {
        this.element.appendChild(document.createTextNode(' '));
      }
    }
    appendChildren(this.element, node.children);
  }

  protected sourceContentRange(source: string): { start: number; end: number } {
    return wholeSource(source);
  }
}

/** The source view is the complete caption line. */
function wholeSource(source: string): { start: number; end: number } {
  return { start: 0, end: source.length };
}
