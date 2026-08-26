import { appendChildren } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstDescriptionDetails, AstDescriptionList, AstDescriptionTerm } from '../ast';

/** Renders a `descriptionlist` node as a `<dl>`. */
export class DescriptionList extends EditableNodeComponent {
  constructor(node: AstDescriptionList) {
    super('descriptionlist', node, document.createElement('dl'), 'my-3');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `descriptionterm` node as a `<dt>`. */
export class DescriptionTerm extends EditableNodeComponent {
  constructor(node: AstDescriptionTerm) {
    super('descriptionterm', node, document.createElement('dt'), 'font-semibold mt-2');
    appendChildren(this.element, node.children);
  }
}

/** Renders a `descriptiondetails` node as a `<dd>`. */
export class DescriptionDetails extends EditableNodeComponent {
  constructor(node: AstDescriptionDetails) {
    super('descriptiondetails', node, document.createElement('dd'), 'ml-4 mb-2');
    appendChildren(this.element, node.children);
  }
}
