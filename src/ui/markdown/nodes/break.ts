import { EditableNodeComponent, type MarkdownBreak } from './editable_node';

/** Renders a hard `break` node. */
export class Break extends EditableNodeComponent {
  constructor(node: MarkdownBreak) {
    super('break', node, document.createElement('br'));
  }
}
