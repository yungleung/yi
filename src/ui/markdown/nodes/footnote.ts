/**
 * Renders a `footnoteDefinition` with its reference anchor on the same line, and
 * a `footnoteReference` as the superscript link that jumps to it.
 *
 * A marker whose label the author wants to change is *shown as its source* while the
 * caret is inside it, like a link: `[1]` is not `[^1]`, so the label's characters are
 * hidden by the rendering and source mode is the editor's one answer to that (see
 * `source_mode.ts`). A click on a marker enters that source; Ctrl-click jumps.
 *
 * May import: the node contract (`editable_node.ts`, `revealable_node.ts`), the
 * registry (`createComponent`), `source_mode.ts` and the AST types. Upholds: a
 * block's rendering is a pure function of its own source — the anchor is named from
 * the node's own label.
 */

import { createComponent } from '../registry';
import { EditableNodeComponent } from './editable_node';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';
import type { AstFootnoteDefinition, AstFootnoteReference } from '../ast';

/** The class a marker's source view carries, so the caret mapping can find it. */
const SOURCE_CLASS = 'markdown-footnote-source';

/** The label between the `[^` and the `]`. */
function labelRange(source: string): { start: number; end: number } {
  const open = source.startsWith('[^') ? 2 : 1;
  return { start: open, end: Math.max(open, source.lastIndexOf(']')) };
}

export class FootnoteDefinition extends EditableNodeComponent {
  constructor(node: AstFootnoteDefinition) {
    super(
      'footnoteDefinition',
      node,
      document.createElement('div'),
      'markdown-footnote text-sm flex items-start gap-2'
    );

    const id = String(node.identifier ?? node.label ?? 'note');

    const anchor = document.createElement('a');
    anchor.id = `fn-${id}`;
    anchor.className = 'mr-2 font-semibold inline-block align-top';
    anchor.textContent = `[${id}]`;
    // Clicking the label of a definition jumps back to its reference; the
    // editor owns that jump, so the label only has to name itself.
    anchor.dataset.footnoteDef = id;
    anchor.title = 'Jump to the marker this note is attached to';
    this.element.appendChild(anchor);

    this.element.appendChild(renderFootnoteBody(node));
  }
}

/**
 * A definition's content, inline: what the notes run shows after the label, and what
 * the marker's preview shows on its own (see `footnote_preview.ts`). One renderer for
 * both, so a note cannot look like two different things.
 */
export function renderFootnoteBody(node: AstFootnoteDefinition): HTMLElement {
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
  return content;
}

/**
 * Renders a `footnoteReference` node as a superscript backlink — or as its own
 * source, `[^label]`, while the caret is inside it.
 */
export class FootnoteReference extends RevealableNodeComponent {
  constructor(node: AstFootnoteReference) {
    const id = String(node.identifier ?? node.label ?? 'note');
    const sourceView = sourceViewFor(node, SOURCE_CLASS, labelRange);
    super('footnoteReference', node, sourceView ?? document.createElement('sup'));

    // Both shapes are a jump target: the definition's label links back to the marker
    // by this name, and it names the marker whether or not the marker shows its text.
    this.element.dataset.footnoteRef = id;
    this.element.title = 'Click to edit the label, ⌘-click to jump to the note';
    if (sourceView) {
      return;
    }

    const link = document.createElement('a');
    link.href = `#fn-${id}`;
    link.className = 'text-primary font-medium';
    link.textContent = `[${id}]`;
    link.id = `fnref-${id}`;
    this.element.appendChild(link);
  }

  /** The label, which is the part of the source a click lands in. */
  protected sourceContentRange(source: string): { start: number; end: number } {
    return labelRange(source);
  }
}
