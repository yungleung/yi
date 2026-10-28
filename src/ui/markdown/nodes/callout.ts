/**
 * Renders one normalized callout and its contents.
 *
 * The marker is editor chrome, not body text. The parsed children remain the
 * source of the visible body, and clicking the title enters the complete
 * callout source through the block-level source-mode path.
 *
 * May import: the node contract, child registry and source entry port.
 * Upholds: only callout kind metadata reaches the editor DOM; authored IDs and
 * arbitrary classes remain export-only.
 */

import type { AstCallout } from '../ast';
import { appendChildren } from '../registry';
import { enterSourceOf } from '../source_mode';
import { EditableNodeComponent } from './editable_node';

/** The concrete editor class for each built-in kind; custom kinds use the base panel. */
const CALLOUT_CLASS: Record<string, string> = {
  note: 'markdown-callout-note',
  tip: 'markdown-callout-tip',
  important: 'markdown-callout-important',
  warning: 'markdown-callout-warning',
  caution: 'markdown-callout-caution'
};

export class Callout extends EditableNodeComponent {
  constructor(node: AstCallout) {
    const element = document.createElement('aside');
    const kindClass = CALLOUT_CLASS[node.callout.kind] ?? 'markdown-callout-custom';
    super(
      'callout',
      node,
      element,
      `markdown-callout ${kindClass}`
    );
    element.setAttribute('data-callout-kind', node.callout.kind);
    element.setAttribute('role', 'note');

    const title = document.createElement('div');
    title.className = 'markdown-callout-title';
    title.setAttribute('data-chrome', 'true');
    title.textContent = node.callout.title;
    title.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterSourceOf(this.element, node.callout.markerFrom);
      (this.element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
    });
    element.appendChild(title);

    const body = document.createElement('div');
    body.className = 'markdown-callout-body';
    appendChildren(body, node.children);
    element.appendChild(body);
  }
}
