/**
 * A frontmatter block: its own YAML/TOML source, highlighted, editable where it
 * sits.
 *
 * A frontmatter block has no rendering to switch to — the source *is* the block —
 * so it takes the shape a fenced code block has at all times: a `pre` holding the
 * markup, with the caret placed at the character clicked.
 *
 * May import: the node contract (`editable_node.ts`), the frontmatter highlighter
 * and the block model's types. Upholds: the text is tagged with the block-relative
 * offset it starts at — zero, because it *is* the block's text — so a click
 * resolves to a rendered position the caret can be placed at and a keystroke maps
 * back to the document exactly (`caret/offsets.ts`), and the highlighting never
 * changes a character of it.
 */

import { EditableNodeComponent } from './editable_node';
import { highlightFrontmatter } from './frontmatter_highlight';
import type { AstNode } from '../ast';
import type { BlockNode } from '../document/blocks';

export class Frontmatter extends EditableNodeComponent {
  constructor(node: BlockNode) {
    // The block tree's nodes are mdast-like (see `blocks.ts`), and this component
    // renders one of them rather than a node of the parsed tree.
    super(
      'frontmatter',
      node as unknown as AstNode,
      document.createElement('pre'),
      'markdown-frontmatter overflow-x-auto'
    );
    this.element.dataset.textFrom = '0';
    const format = node.format ?? 'yaml';
    const code = document.createElement('code');
    code.className = `language-${format}`;
    code.innerHTML = highlightFrontmatter(node.text, format);
    this.element.appendChild(code);
  }
}
