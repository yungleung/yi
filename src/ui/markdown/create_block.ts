/**
 * Block component factory — the block-level counterpart of `create_node.ts`.
 * The virtual renderer composes these individual block elements.
 *
 * May import: the document's blocks, the node registry, the caret, `source_mode.ts`, the fenced
 * block's text and the three highlighters. Upholds: a block's rendering is a pure function of its
 * own source — the component is built from the block's slice, and the block's line range is tagged
 * on it for everything that maps back.
 */

import { type BlockNode } from './document/blocks';
import { hasBodyView } from './document/block_kinds';;
import type { RootContent } from 'mdast';
import { appendChildren } from './registry';
import { isSourceBlock, withRenderFrame } from './source_mode';
import { showCaret } from './caret/caret';
import { FenceText, type FenceTextStyle } from './nodes/fence_text';
import { Equation, EquationSource } from './nodes/equation';
import { TableCaption } from './nodes/table_caption';
import { ListCaption } from './nodes/list_caption';
import { fenceLabel } from './nodes/fence_label';
import { chooseLanguage } from './editing/language_picker';
import { highlightCode } from './nodes/code_highlight';
import { highlightFrontmatter } from './nodes/frontmatter_highlight';
import { highlightLatex } from './nodes/latex_highlight';
import { fenceLanguage } from './syntax/markers';
import {
  innerEquationBody,
  readEquationBlockSource
} from './syntax/equation_blocks';
import { renderContext } from './render_context';
import { CHAR_START, LINE_END, LINE_START, TEXT_FROM, setOffset } from './offset_tags';
// Importing the registration bootstrap registers every node component.
import './create_node';

export interface BlockComponent {
  readonly type: 'block';
  readonly node: BlockNode;
  readonly element: HTMLElement;
}

/**
 * Creates a block component from the block's parsed children. Parsing happens
 * in the editor state, which is the single place that knows how a block's
 * source is prepared for the renderer.
 */
export function createBlockComponent(node: BlockNode, children: RootContent[]): BlockComponent {
  return new BlockView(node, children);
}

/** A single block: a line-tagged container holding the block's content. */
class BlockView implements BlockComponent {
  readonly type = 'block' as const;
  readonly node: BlockNode;
  readonly element: HTMLElement;

  constructor(node: BlockNode, children: RootContent[]) {
    this.node = node;
    // The block is built with itself named as the one being built, so a node
    // inside it can tell whether its own source is the one being shown (see
    // `source_mode.ts`).
    this.element = withRenderFrame(node, () =>
      node.kind === 'blank'
        ? this.renderBlank(node)
        : node.kind === 'equation'
          ? this.renderEquation(node)
        : isSourceBlock(node)
          ? this.renderSource(node)
          : hasBodyView(node.kind)
            ? this.renderFenceBody(node)
            : this.renderParsed(node, children)
    );
  }

  /** A labeled equation: KaTeX, one Yi number, or the complete wrapper as source. */
  private renderEquation(node: BlockNode): HTMLElement {
    const source = readEquationBlockSource(node.text);
    const element = this.container(node);
    if (source === null) {
      return this.renderParsed(node, []);
    }
    element.classList.add('markdown-equation-block');
    if (source.id !== null) {
      element.id = source.id;
    }
    if (isSourceBlock(node)) {
      element.appendChild(new EquationSource(node).element);
      return element;
    }
    element.appendChild(
      new Equation(node, source, innerEquationBody(source.body)).element
    );
    const numberText = renderContext().equationNumberAt(node.charStart + source.from);
    if (numberText !== null) {
      const number = document.createElement('span');
      number.className = 'markdown-equation-number';
      number.setAttribute('data-chrome', 'true');
      number.textContent = numberText;
      element.appendChild(number);
    }
    return element;
  }

  /**
   * The block's own text, delimiters and all, shown while the caret is inside it: the shape
   * `source_mode.ts` names for a fenced block, and the one its rendering cannot hold a caret in —
   * a formula's KaTeX has no characters to aim at, and the other two hide the lines a character
   * typed at the body's edge would land on (see `nodes/fence_text.ts`).
   */
  private renderSource(node: BlockNode): HTMLElement {
    const kind = fenceKind(node);
    const element = this.container(node);
    element.appendChild(
      new FenceText(
        node,
        { ...kind, className: `${SOURCE_CLASS} ${kind.className}` },
        true
      ).element
    );
    element.appendChild(this.label(kind, node));
    return element;
  }

  /** A blank line the author added: an empty paragraph holding the caret. */
  private renderBlank(node: BlockNode): HTMLElement {
    const element = this.container(node);
    element.classList.add('markdown-blank');
    const paragraph = document.createElement('p');
    paragraph.className = 'markdown-node markdown-empty-line';
    const placeholder = document.createElement('span');
    placeholder.className = 'markdown-empty-line-placeholder markdown-node';
    // Block-relative: an empty paragraph starts at its own line start. The node it holds is
    // *empty*: a blank line has no character of its own — the space it used to hold was a
    // placeholder only the caret could see, and a character that is not the author's is one the
    // reader could select and copy. What gives the line a box is the paragraph (`styles.css`) and
    // what gives the caret a place is `caret/geometry.ts: lineBoxAround` (see also `nodes/list.ts`
    // and `nodes/table.ts`, which hold the same empty node for an empty item and cell).
    setOffset(placeholder, TEXT_FROM, 0);
    placeholder.appendChild(document.createTextNode(''));
    paragraph.appendChild(placeholder);
    element.appendChild(paragraph);
    // An empty paragraph holds no characters to aim at, so every click on it
    // puts the caret at the start of the line it stands for.
    paragraph.addEventListener('click', (event) => {
      event.stopPropagation();
      const text = placeholder.firstChild;
      if (!text) {
        return;
      }
      const caret = document.createRange();
      caret.setStart(text, 0);
      caret.collapse(true);
      showCaret(caret);
      (element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
    });
    return element;
  }

  private renderParsed(node: BlockNode, children: RootContent[]): HTMLElement {
    const element = this.container(node);
    // The heading's level marker sits outside its own content box. The block owns that gutter so
    // content-visibility does not clip the marker or its hover target (`styles.css`).
    if (children.some((child) => child.type === 'heading')) {
      element.classList.add('markdown-heading-block');
    }
    appendChildren(element, children);
    const table = children.find((child) => child.type === 'table');
    const caption = table?.type === 'table' ? table.tableCaption : undefined;
    if (caption) {
      element.classList.add('markdown-table-block');
      if (caption.id !== null) {
        element.id = caption.id;
      }
      element.appendChild(new TableCaption(caption).element);
    }
    const list = children.find(
      (child) => child.type === 'list' && child.listCaption !== undefined
    );
    const listCaption = list?.type === 'list' ? list.listCaption : undefined;
    if (listCaption) {
      element.classList.add('markdown-list-block');
      if (listCaption.id !== null) {
        element.id = listCaption.id;
      }
      element.appendChild(new ListCaption(listCaption).element);
    }
    return element;
  }

  /**
   * A fenced block's body, its delimiters hidden: what a fenced code block and a frontmatter block
   * render while the caret is elsewhere. A display formula has no body to render — its view is the
   * KaTeX parse (`nodes/math.ts`), which is what `renderParsed` draws.
   *
   * The body is the block's own characters — a node like any other, so a click lands on the
   * character clicked and a keystroke writes there — highlighted in the language the fence named,
   * or the block's own format (see `nodes/fence_text.ts`).
   */
  private renderFenceBody(node: BlockNode): HTMLElement {
    const kind = fenceKind(node);
    const element = this.container(node);
    element.appendChild(
      new FenceText(node, { ...kind, className: `${kind.className} ${OVERFLOW_CLASS}` }).element
    );
    element.appendChild(this.label(kind, node));
    return element;
  }

  /**
   * What the block's corner says (`nodes/fence_label.ts`): a fenced code block's language is the
   * one thing about it the reader may change, so there the label is a button that asks for it
   * (`editing/language_picker.ts`); the other two are badges.
   */
  private label(kind: FenceKind, node: BlockNode): HTMLElement {
    return kind.choosesLanguage
      ? fenceLabel({
          text: kind.label,
          onChoose: (label) => chooseLanguage(label, kind.language, node.lineStart)
        })
      : fenceLabel({ text: kind.label });
  }

  private container(node: BlockNode): HTMLElement {
    const element = document.createElement('div');
    element.className = 'markdown-block';
    setOffset(element, LINE_START, node.lineStart);
    setOffset(element, LINE_END, node.lineEnd);
    // The block's character start, refreshed on every render/edit. Revealed
    // source spans use it to tag block-relative positions.
    setOffset(element, CHAR_START, node.charStart);
    return element;
  }
}

/** The class that marks a block as showing its own source rather than its view. */
const SOURCE_CLASS = 'markdown-source-text';

/** The class every source box and body box carries: a long line scrolls rather than wraps. */
const OVERFLOW_CLASS = 'overflow-x-auto';

/** What a fenced block is: how its own characters are drawn, and what its corner says. */
interface FenceKind extends FenceTextStyle {
  /** What the block's label says (`nodes/fence_label.ts`). */
  readonly label: string;
  /** Whether that label is a button that asks for the block's language. */
  readonly choosesLanguage: boolean;
}

/**
 * The three fenced kinds, read off the block: one home for how each draws its own characters —
 * the class of its box, the language its body is highlighted as, and what its corner says.
 */
function fenceKind(node: BlockNode): FenceKind {
  if (node.kind === 'frontmatter') {
    return {
      className: 'markdown-frontmatter',
      language: 'yaml',
      highlight: (source) => highlightFrontmatter(source),
      label: 'YAML Frontmatter',
      choosesLanguage: false
    };
  }
  if (node.kind === 'fencedCode') {
    const language = fenceLanguage(firstLine(node.text));
    return {
      className: 'markdown-fenced-code',
      language,
      highlight: (source) => highlightCode(source, language),
      label: language === '' ? 'text' : language,
      choosesLanguage: true
    };
  }
  // Display math: its view is KaTeX, so only its own text is drawn here, and that text is LaTeX.
  return {
    className: 'markdown-display-math',
    language: 'latex',
    highlight: highlightLatex,
    label: 'latex',
    choosesLanguage: false
  };
}

/** A block's first line, where a fence names its language. */
function firstLine(text: string): string {
  const breakAt = text.indexOf('\n');
  return breakAt < 0 ? text : text.slice(0, breakAt);
}
