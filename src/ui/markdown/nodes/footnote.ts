import { createComponent } from '../registry';
import { EditableNodeComponent } from './editable_node';
import type { AstFootnoteDefinition, AstFootnoteReference } from '../ast';

/** Renders a `footnoteDefinition` node with its reference anchor on the same line. */
export class FootnoteDefinition extends EditableNodeComponent {
  constructor(node: AstFootnoteDefinition) {
    super(
      'footnoteDefinition',
      node,
      document.createElement('div'),
      'mt-3 text-sm flex items-start gap-2'
    );

    const id = String(node.identifier ?? node.label ?? 'note');

    const anchor = document.createElement('a');
    anchor.id = `fn-${id}`;
    anchor.className = 'mr-2 font-semibold inline-block align-top';
    anchor.textContent = `[${id}]`;
    this.element.appendChild(anchor);

    const content = document.createElement('span');
    content.className = 'inline';

    // Flatten paragraph children to inline content so the number and text stay on one line.
    for (const child of node.children) {
      if (child.type === 'paragraph') {
        for (const grandChild of child.children) {
          const component = createComponent(grandChild);
          if (component) {
            content.appendChild(component.element);
          }
        }
      } else {
        const component = createComponent(child);
        if (component) {
          content.appendChild(component.element);
        }
      }
    }

    this.element.appendChild(content);
  }
}

/** Renders a `footnoteReference` node as a superscript backlink. */
export class FootnoteReference extends EditableNodeComponent {
  constructor(node: AstFootnoteReference) {
    super('footnoteReference', node, document.createElement('sup'));

    const id = String(node.identifier ?? node.label ?? 'note');
    const link = document.createElement('a');
    link.href = `#fn-${id}`;
    link.className = 'text-primary font-medium';
    link.textContent = `[${id}]`;
    link.id = `fnref-${id}`;
    this.element.appendChild(link);
  }
}
