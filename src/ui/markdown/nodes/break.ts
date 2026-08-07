import { EditableNodeComponent } from './editable_node';
import type { AstBreak } from '../ast';

/** Renders a hard `break` node. */
export class Break extends EditableNodeComponent {
  constructor(node: AstBreak) {
    super('break', node, document.createElement('br'));
  }
}
