import { EditableNodeComponent } from './editable_node';
import type { AstThematicBreak } from '../ast';

/** Renders a `thematicBreak` node. */
export class ThematicBreak extends EditableNodeComponent {
  constructor(node: AstThematicBreak) {
    super('thematicBreak', node, document.createElement('hr'), 'min-w-0');
  }
}
