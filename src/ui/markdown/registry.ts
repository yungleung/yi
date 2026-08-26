/**
 * Shared component registry for mdast node types.
 *
 * The editable node components register their factories here (see
 * `create_node.ts`, the registration bootstrap) instead of being imported by
 * the factory module. This breaks the `create_node ↔ nodes/*` import cycle:
 * node modules depend only on this registry, and this registry depends only
 * on the shared base classes.
 */

import type { AstNode } from './ast';
import { EditableNodeComponent, type EditableMarkdownNode } from './nodes/editable_node';

type ComponentFactory = (node: AstNode) => EditableMarkdownNode | null;

const factories = new Map<string, ComponentFactory>();

/** Registers the component factory for an mdast node type. */
export function registerComponent(type: string, factory: ComponentFactory): void {
  factories.set(type, factory);
}

/**
 * Creates the editable component for a node. Nodes that are deliberately not
 * rendered (image references, definitions) return null; unknown node types
 * fall back to a generic container.
 */
export function createComponent(node: AstNode): EditableMarkdownNode | null {
  const factory = factories.get(node.type);
  if (factory) {
    return factory(node);
  }
  if (node.type === 'imageReference' || node.type === 'definition') {
    return null;
  }
  return new GenericContainer(node);
}

/** Appends the rendered children of an mdast node into a container. */
export function appendChildren(
  container: HTMLElement,
  children: readonly AstNode[] | undefined
): void {
  for (const child of children ?? []) {
    const component = createComponent(child);
    if (component) {
      container.appendChild(component.element);
    }
  }
}

/** Fallback for unknown node types: a generic block container. */
class GenericContainer extends EditableNodeComponent {
  constructor(node: AstNode) {
    super(String(node.type ?? 'unknown'), node, document.createElement('div'), 'min-w-0');
    appendChildren(this.element, (node as { children?: AstNode[] }).children);
  }
}
