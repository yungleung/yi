import { EditableNodeComponent } from './editable_node';
import type { AstText } from '../ast';

/** Renders a plain text leaf as an editable component. */
export class TextNode extends EditableNodeComponent {
  constructor(node: AstText) {
    super('text', node, document.createElement('span'));
    this.element.textContent = preserveSpaces(String(node.value ?? ''));
    // Tag the leaf's raw start so DOM positions can be mapped back to the
    // document exactly (see `caret/offsets.ts`). Positions come from the
    // whole-document parse today, so they are absolute; once blocks are
    // parsed independently this becomes block-relative and the mapping must
    // add the block's `charStart` instead.
    const start = (
      node as { position?: { start: { offset?: number } } }
    ).position?.start.offset;
    if (start !== undefined) {
      this.element.dataset.textFrom = String(start);
    }
  }
}

/** Keeps consecutive source spaces visible without changing their length. */
export function preserveSpaces(value: string): string {
  return value.replace(/ {2,}/g, (run) => ` ${'\u00a0'.repeat(run.length - 1)}`);
}
