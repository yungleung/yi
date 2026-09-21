/**
 * Shared component registry for mdast node types.
 *
 * The editable node components register their factories here (see
 * `create_node.ts`, the registration bootstrap) instead of being imported by
 * the factory module. This breaks the `create_node ↔ nodes/*` import cycle:
 * node modules depend only on this registry, and this registry depends only
 * on the shared base classes.
 *
 * May import: the AST types and the node base classes. Upholds: the registry is
 * the one place that says which node types exist and which of them show their
 * source, so every consumer of that fact — `create_node.ts`, `source_mode.ts` —
 * reads it here.
 */

import type { AstNode } from './ast';
import { EditableNodeComponent, type EditableMarkdownNode } from './nodes/editable_node';

type ComponentFactory = (node: AstNode) => EditableMarkdownNode | null;

/** A node type's component factory, and whether its source can stand in for its rendering. */
interface Registration {
  factory: ComponentFactory;
  showsSource: boolean;
}

const factories = new Map<string, Registration>();

/**
 * Registers the component factory for an mdast node type.
 *
 * `showsSource` marks the types whose markdown source can be shown in place of
 * their rendering while the caret is inside them — a link, a citation, a
 * formula, an image (see `source_mode.ts`). Everything that finds "the source
 * the caret is in" goes through this flag, so the registration is the single
 * place that says which nodes have a source to show.
 */
export function registerComponent(
  type: string,
  factory: ComponentFactory,
  showsSource = false
): void {
  factories.set(type, { factory, showsSource });
}

/** Whether this node type has a source that can stand in for its rendering. */
export function showsSource(type: string): boolean {
  return factories.get(type)?.showsSource ?? false;
}

/**
 * Creates the editable component for a node. Nodes that are deliberately not
 * rendered (image references, definitions) return null; unknown node types
 * fall back to a generic container.
 */
export function createComponent(node: AstNode): EditableMarkdownNode | null {
  const registration = factories.get(node.type);
  if (registration) {
    return registration.factory(node);
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
