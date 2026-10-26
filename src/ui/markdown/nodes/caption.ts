/**
 * Renders a table or list caption and reveals its complete source line for editing.
 *
 * The generated number is chrome. The caption's inline Markdown remains the
 * source of its visible text, and the node's own source includes `:`, the
 * caption, and the trailing Pandoc attributes.
 *
 * May import: the revealable-node contract, the registry's child helper, the
 * render context, and both caption node types. Upholds: table and list captions
 * share one click, reveal, source-offset, and numbering path; only their owner
 * and alignment differ.
 */

import type { ListCaptionNode } from '../syntax/list_captions';
import type { TableCaptionNode } from '../syntax/table_captions';
import { appendChildren } from '../registry';
import { renderContext } from '../render_context';
import { renderingBlock } from '../source_mode';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';

/** The two owners a caption can follow. */
export type CaptionKind = 'table' | 'list';

/** The parser data the shared caption renderer consumes. */
export type CaptionNode = TableCaptionNode | ListCaptionNode;

export class Caption extends RevealableNodeComponent {
  constructor(node: CaptionNode, kind: CaptionKind) {
    const sourceView = sourceViewFor(
      node,
      'markdown-caption-source',
      wholeSource
    );
    super(
      node.type,
      node,
      sourceView ?? document.createElement('div'),
      sourceView ? '' : 'markdown-caption'
    );
    if (sourceView) {
      return;
    }
    this.element.setAttribute('role', 'caption');
    const block = renderingBlock();
    const ownerFrom = ownerFromFor(node, kind);
    const from = block === null ? null : block.charStart + ownerFrom;
    const number =
      from === null
        ? null
        : kind === 'table'
          ? renderContext().tableLabelAt(from)
          : renderContext().listLabelAt(from);
    if (number !== null) {
      const label = document.createElement('span');
      label.className = 'markdown-caption-number';
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

  protected override entryOffset(): number {
    return (this.node as CaptionNode).position.end.offset;
  }
}

/** The caption's owner starts at this block-relative offset, or is unknown. */
function ownerFromFor(node: CaptionNode, kind: CaptionKind): number {
  return kind === 'table'
    ? (node as TableCaptionNode).tableFrom
    : (node as ListCaptionNode).listFrom;
}

/** The source view is the complete caption line. */
function wholeSource(source: string): { start: number; end: number } {
  return { start: 0, end: source.length };
}
