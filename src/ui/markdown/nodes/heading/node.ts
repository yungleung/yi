/**
 * Renders a `heading` node as an `h1`–`h6`, by its depth.
 *
 * May import: the node contract (`editable_node.ts`), the registry's child helper, the generated
 * level marker, its hover target and the AST types. Upholds: a block's rendering is a pure
 * function of its own source — the depth comes from the node, not from where it sits.
 */

import { appendChildren } from '../../registry';
import { EditableNodeComponent } from '../editable_node';
import { headingHoverTarget } from './hover';
import { headingMarker, type HeadingLevel } from './marker';
import type { AstHeading } from '../../ast';
import { isShownSourceRange, renderingBlock } from '../../source_mode';
import { renderContext } from '../../render_context';
import { SOURCE_FROM, setOffset } from '../../offset_tags';

export class Heading extends EditableNodeComponent {
  constructor(node: AstHeading) {
    const depth = Math.min(Math.max(node.depth ?? 1, 1), 6) as HeadingLevel;
    super('heading', node, document.createElement('h' + depth), 'markdown-heading min-w-0');
    const block = renderingBlock();
    const positionStart = node.position?.start.offset;
    const from =
      block && positionStart !== undefined ? block.charStart + positionStart : null;
    const id =
      node.headingAttributes?.id ??
      (from === null ? null : renderContext().headingId(from));
    if (id) {
      this.element.id = id;
    }
    const marker = headingMarker(depth);
    if (node.children.length === 0) {
      marker.classList.add('markdown-heading-marker-empty');
    }
    this.element.append(headingHoverTarget(), marker);
    appendChildren(this.element, node.children);
    const attributes = node.headingAttributes;
    if (attributes && isShownSourceRange(attributes.from, attributes.to)) {
      const source = document.createElement('span');
      source.className =
        'markdown-heading-attributes-source markdown-source-view markdown-node';
      setOffset(source, SOURCE_FROM, attributes.from);
      source.textContent = attributes.source;
      this.element.appendChild(source);
    }
  }
}
