/**
 * Renders a `footnoteDefinition` with its reference anchor on the same line, and
 * a `footnoteReference` as the superscript link that jumps to it.
 *
 * Both ends of a footnote draw the same marker — `[1]` for `[^1]`, exactly as a link
 * renders its title — so both hide the characters the author typed, and both are shown as
 * their own source while the caret is inside them (see `source_mode.ts`). A definition's
 * label is the only source that is part of a node rather than a node, so it asks with its
 * own range; a click on either end enters the label at the end of its content, and
 * Ctrl-click jumps between the two. What the marker *says* is the author's label, not the
 * parse's normalised one: markdown matches labels case-insensitively, so `[^Ab]` and `[^ab]`
 * are one footnote and the parse keeps `ab` — drawing that made a marker read `[ab]` where
 * the note says `[^Ab]`, which is why {@link authoredLabel} reads the source instead.
 *
 * May import: the node contract (`editable_node.ts`, `revealable_node.ts`), the
 * registry (`createComponent`), the marker's shape (`syntax/footnote/model.ts:
 * markerShape`), `source_mode.ts` and the AST types. Upholds: a block's rendering is
 * a pure function of its own source — the anchor is named from the node's own label.
 */

import { createComponent } from '../registry';
import { isShownSourceRange, renderingBlock, shownSourceText } from '../source_mode';
import { markerShape } from '../syntax/footnote';
import { EditableNodeComponent } from './editable_node';
import { RevealableNodeComponent, sourceViewFor } from './revealable_node';
import type { AstFootnoteDefinition, AstFootnoteReference } from '../ast';
import { CONTENT_END, CONTENT_START, SOURCE_FROM, TEXT_FROM, setOffset } from './../offset_tags';

/** The class a marker's source view carries, so the caret mapping can find it. */
const SOURCE_CLASS = 'markdown-footnote-source';

export class FootnoteDefinition extends EditableNodeComponent {
  constructor(node: AstFootnoteDefinition) {
    super(
      'footnoteDefinition',
      node,
      document.createElement('div'),
      'markdown-footnote flex items-start'
    );

    this.element.append(new FootnoteLabel(node).element, renderFootnoteBody(node));
  }
}

/**
 * The `[^label]` a definition is named by: drawn as the marker it is — `[1]`, the shape the
 * reference in the text draws — and shown as its own source while the caret is inside it.
 *
 * The label is not a node of the parse: it is the head of the definition's own text, which
 * is why it asks whether the source being shown is its own range rather than its node's
 * (`source_mode.ts: isShownSourceRange`), and why the caret model has to know that a
 * definition draws a marker's worth of characters before its note (`caret/offsets.ts`).
 * `id` is the name the marker links to and `footnoteDef` the one the jump is asked for;
 * both ride both shapes, so the jump's target exists whether or not the caret is in the
 * label.
 */
class FootnoteLabel extends RevealableNodeComponent {
  /** Where the label's own characters sit inside the marker, from the parse's label. */
  private readonly content: { start: number; end: number };
  /** Whether the definition has a position, which is what names the text a click shows. */
  private readonly named: boolean;

  constructor(node: AstFootnoteDefinition) {
    const id = String(node.identifier ?? node.label ?? 'note');
    // The author's characters, not the parse's: a label is matched case-insensitively, so the parse
    // keeps `ab` for a note that says `[^Ab]`, and a marker drawn from that disagreed with the source
    // until the caret was in it (`test/probes/footnote-labelled.js`).
    const label = authoredLabel(node) ?? String(node.label ?? node.identifier ?? 'note');
    const start = node.position?.start?.offset;
    const marker = markerShape(label);
    const shown = start !== undefined && isShownSourceRange(start, start + marker.end);
    super('footnoteLabel', node, labelElement({ id, label, start, shown }));
    this.content = marker.label;
    this.named = start !== undefined;
    this.element.id = `fn-${id}`;
    this.element.dataset.footnoteDef = id;
  }

  /** A label whose definition has no position cannot name the text a click would show. */
  protected override shouldReveal(): boolean {
    return this.named;
  }

  /** The label, which is the part of the source a click lands in. */
  protected sourceContentRange(): { start: number; end: number } {
    return this.content;
  }
}

/**
 * The label as the notes run draws it: the marker, or its own source while that is what
 * the caret shows. Both keep the run's own layout classes — the label is the first thing
 * on the line and the note's text follows it, so a shape that changed its box would move
 * the note under the reader.
 */
function labelElement(shape: {
  id: string;
  label: string;
  start: number | undefined;
  shown: boolean;
}): HTMLElement {
  if (!shape.shown || shape.start === undefined) {
    const anchor = document.createElement('a');
    anchor.className = 'markdown-footnote-label font-semibold inline-block align-top';
    anchor.textContent = `[${shape.label}]`;
    return anchor;
  }
  const marker = markerShape(shape.label);
  const span = document.createElement('span');
  span.className = `markdown-source-view ${SOURCE_CLASS} markdown-footnote-label inline-block align-top`;
  span.textContent = shownSourceText() ?? `[^${shape.label}]`;
  // Block-relative, like every source view: the caret mapping adds the block's start.
  setOffset(span, SOURCE_FROM, shape.start);
  setOffset(span, CONTENT_START, marker.label.start);
  setOffset(span, CONTENT_END, marker.label.end);
  // This source *is* the characters the author typed, so it keeps the tag that says so:
  // the caret mapping and the local write both read it (`caret/offsets.ts`,
  // `editing/typed_text.ts`). The drawn marker carries no tag — `[1]` is not the
  // document's text, and a tag claiming it was would be a lie the write path acts on.
  setOffset(span, TEXT_FROM, shape.start);
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
    const label = authoredLabel(node) ?? String(node.label ?? node.identifier ?? 'note');
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
    link.textContent = `[${label}]`;
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

/**
 * The label as the author wrote it — the source between the `[^` and the `]` at the node's own
 * position — or null when the node has no position or was built outside a render pass.
 *
 * The parse normalises a label (lower case, and whitespace runs) because markdown matches labels that
 * way; drawing the normalised one made a marker read `[ab]` where the note says `[^Ab]`, so the two
 * ends agreed with each other and disagreed with the source until the caret was inside it. The source
 * is where the author's characters are, and the renderer names the block it is building
 * (`source_mode.ts: renderingBlock`) so a node can read them without being handed the document.
 */
function authoredLabel(node: { position?: { start?: { offset?: number } } }): string | null {
  const block = renderingBlock();
  const start = node.position?.start?.offset;
  if (block === null || start === undefined) {
    return null;
  }
  const at = start - block.charStart;
  const marker = /^\[\^([^\]\n]+)\]/.exec(block.text.slice(at));
  return marker === null ? null : marker[1];
}
