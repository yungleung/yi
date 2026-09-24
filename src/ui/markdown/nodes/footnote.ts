/**
 * Renders a `footnoteDefinition` with its reference anchor on the same line, and
 * a `footnoteReference` as the superscript link that jumps to it.
 *
 * Neither end of a footnote holds the label's characters: the marker renders `[1]` for
 * `[^1]`, exactly as a link renders its title, so the label's source stands in for it
 * while the caret is inside it (see `source_mode.ts`). A definition's label is drawn
 * that way too — it is the only source that is part of a node rather than a node, so it
 * asks with its own range — and a click on either end enters the label where it can:
 * the marker at the end of its content, the definition's label at the character clicked,
 * which is a character its rendering spells out. Ctrl-click jumps.
 *
 * May import: the node contract (`editable_node.ts`, `revealable_node.ts`), the
 * registry (`createComponent`), the marker's shape (`syntax/footnotes.ts:
 * markerShape`), `source_mode.ts` and the AST types. Upholds: a block's rendering is
 * a pure function of its own source — the anchor is named from the node's own label.
 */

import { createComponent } from '../registry';
import { isShownSourceRange, shownSourceText } from '../source_mode';
import { markerShape } from '../syntax/footnotes';
import { EditableNodeComponent } from './editable_node';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';
import type { AstFootnoteDefinition, AstFootnoteReference } from '../ast';

/** The class a marker's source view carries, so the caret mapping can find it. */
const SOURCE_CLASS = 'markdown-footnote-source';

export class FootnoteDefinition extends EditableNodeComponent {
  constructor(node: AstFootnoteDefinition) {
    super(
      'footnoteDefinition',
      node,
      document.createElement('div'),
      'markdown-footnote text-sm flex items-start gap-2'
    );

    this.element.append(renderFootnoteLabel(node), renderFootnoteBody(node));
  }
}

/**
 * The `[^label]` a definition is named by, as the author wrote it: one function for the two
 * places it is drawn — the notes run and the marker's preview card, which shows which note it
 * is showing.
 *
 * It is tagged as the block's own text from the definition's first character — not the
 * block's, which is only the same thing when the definition starts its own block — so a
 * caret put in the label maps back to the document at the label (see `caret/offsets.ts`);
 * a plain click edits the label, ⌘-click jumps back to the marker. Its `id` is the name
 * the marker links to, and `footnoteDef` is the normalised one the jump is asked for.
 */
export function renderFootnoteLabel(node: AstFootnoteDefinition): HTMLElement {
  const id = String(node.identifier ?? node.label ?? 'note');
  const label = String(node.label ?? node.identifier ?? 'note');
  const start = node.position?.start?.offset;
  const marker = markerShape(label);
  const text = `[^${label}]`;
  const element =
    start !== undefined && isShownSourceRange(start, start + marker.end)
      ? renderShownLabel(marker, start, shownSourceText() ?? text)
      : renderLabelAnchor(text);
  element.id = `fn-${id}`;
  // The tag names the definition's own first character, not the block's: a notes run
  // holds one definition after another, and the second one's label is nowhere near the
  // block's start. It stays on the source view as well, because this source *is* the
  // characters the author typed — the text leaf `editing/typed_text.ts` writes into,
  // exactly as the rendering is.
  element.dataset.textFrom = String(start ?? 0);
  element.dataset.footnoteDef = id;
  return element;
}

/** The label as the notes run and the preview card draw it. */
function renderLabelAnchor(text: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.className = 'mr-2 font-semibold inline-block align-top';
  anchor.textContent = text;
  return anchor;
}

/**
 * The label as its own source: the shape every source view wears, over the definition's
 * own characters. The label's layout classes stay — it is still the first thing in the
 * notes run, and the note's text must not move because the caret came to rest on it —
 * while its weight comes from the source rather than from the rendering.
 */
function renderShownLabel(
  marker: { end: number; label: { start: number; end: number } },
  start: number,
  text: string
): HTMLElement {
  const span = document.createElement('span');
  span.className = `markdown-source-view ${SOURCE_CLASS} mr-2 inline-block align-top`;
  span.textContent = text;
  // Block-relative, like every source view: the caret mapping adds the block's start.
  span.dataset.sourceFrom = String(start);
  span.dataset.contentStart = String(marker.label.start);
  span.dataset.contentEnd = String(marker.label.end);
  return span;
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
  /** Where the label's characters sit inside the marker this node was built from. */
  private readonly content: { start: number; end: number };

  constructor(node: AstFootnoteReference) {
    const id = String(node.identifier ?? node.label ?? 'note');
    const label = String(node.label ?? node.identifier ?? 'note');
    const content = markerShape(label).label;
    const sourceView = sourceViewFor(node, SOURCE_CLASS, () => content);
    super('footnoteReference', node, sourceView ?? document.createElement('sup'));
    this.content = content;

    // Both shapes are a jump target: the definition's label links back to the marker
    // by this name, and it names the marker whether or not the marker shows its text.
    this.element.dataset.footnoteRef = id;
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

  /**
   * The label, which is the part of the source a click lands in: the text being drawn
   * and the parse's label are the same characters between the same two markers, so the
   * range is the shape's own and the `source` handed in is not read.
   */
  protected sourceContentRange(): { start: number; end: number } {
    return this.content;
  }
}
