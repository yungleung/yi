/**
 * Renders one table caption and reveals its complete source line for editing.
 *
 * The generated number is chrome. The caption's inline Markdown remains the
 * source of its visible text, and the node's own source includes `:`, the
 * caption, and the trailing Pandoc attributes.
 *
 * May import: the revealable-node contract, the registry's child helper, the
 * render context and the caption node type. Upholds: a click maps through the
 * caption's own document range, never through a table cell.
 */

import type { TableCaptionNode } from '../syntax/table_captions';
import { appendChildren } from '../registry';
import { renderContext } from '../render_context';
import { renderingBlock } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

const SOURCE_CLASS = 'markdown-table-caption-source';

export class TableCaption extends RevealableNodeComponent {
  constructor(node: TableCaptionNode) {
    const sourceView = sourceViewFor(node, SOURCE_CLASS, wholeSource);
    super(
      'tableCaption',
      node,
      sourceView ?? document.createElement('div'),
      sourceView ? '' : 'markdown-table-caption'
    );
    if (sourceView) {
      return;
    }
    this.element.setAttribute('role', 'caption');
    const block = renderingBlock();
    const from = block === null ? null : block.charStart + node.tableFrom;
    const number = from === null ? null : renderContext().tableLabelAt(from);
    if (number !== null) {
      const label = document.createElement('span');
      label.className = 'markdown-table-number';
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
