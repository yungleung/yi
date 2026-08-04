import { appendChildren } from './create_node';
import {
  EditableNodeComponent,
  type DescriptionDetailsNode,
  type DescriptionListNode,
  type DescriptionTermNode
} from './editable_node';

/** Renders a `descriptionlist` node as a `<dl>`. */
export class DescriptionList extends EditableNodeComponent {
  constructor(node: DescriptionListNode) {
    super('descriptionlist', node, document.createElement('dl'), 'my-3');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `descriptionterm` node as a `<dt>`. */
export class DescriptionTerm extends EditableNodeComponent {
  constructor(node: DescriptionTermNode) {
    super('descriptionterm', node, document.createElement('dt'), 'font-semibold mt-2');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `descriptiondetails` node as a `<dd>`. */
export class DescriptionDetails extends EditableNodeComponent {
  constructor(node: DescriptionDetailsNode) {
    super('descriptiondetails', node, document.createElement('dd'), 'ml-4 mb-2');
    appendChildren(this.element, node.children);
  }
}
