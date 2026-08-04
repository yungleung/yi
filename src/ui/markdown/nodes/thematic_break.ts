import { EditableNodeComponent, type MarkdownThematicBreak } from './editable_node';

/** Renders a `thematicBreak` node. */
export class ThematicBreak extends EditableNodeComponent {
  constructor(node: MarkdownThematicBreak) {
    super('thematicBreak', node, document.createElement('hr'), 'min-w-0');
  }
}
