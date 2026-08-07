import type { Root } from 'mdast';
import { createNodeComponent } from './create_node';

/**
 * Renders an mdast tree into a DOM element. Every node is built by its own
 * editable component (see `./nodes`), so the result is a tree of
 * {@link EditableMarkdownNode} components that place a blinking caret where clicked.
 */
export function renderMarkdownAst(root: Root): HTMLElement {
  const component = createNodeComponent(root);
  return component ? component.element : document.createElement('div');
}
