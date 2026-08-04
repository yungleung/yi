import { EditableNodeComponent, type MarkdownImage } from './editable_node';

/** Renders an `image` node. */
export class Image extends EditableNodeComponent {
  constructor(node: MarkdownImage) {
    super('image', node, document.createElement('img'), 'max-w-full');
    const img = this.element as HTMLImageElement;
    img.src = node.url || '';
    img.alt = node.alt || '';
    img.title = node.title || '';
  }
}
