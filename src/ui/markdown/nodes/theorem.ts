/**
 * Renders one theorem or proof with its generated heading and editable body.
 *
 * Example: `.Theorem info="Bayes"` renders `定理 1 (Bayes).` from document
 * metadata while the body remains ordinary Markdown. The heading is editor
 * chrome; clicking it enters the complete fenced-Div source.
 *
 * May import: the node contract, child registry, render context and source
 * entry port. Upholds: authored IDs, classes and attributes remain source-only.
 */

import type { AstTheorem } from '../ast';
import { renderContext } from '../render_context';
import { appendChildren } from '../registry';
import { enterSourceOf, renderingBlock } from '../source_mode';
import { fragmentProcessor } from '../syntax/remark_pipeline';
import { TEXT_FROM, THEOREM_BODY_ANCHOR, setOffset } from '../offset_tags';
import { EditableNodeComponent } from './editable_node';

const THEOREM_CLASS: Record<string, string> = {
  plain: 'markdown-theorem-plain',
  definition: 'markdown-theorem-definition',
  remark: 'markdown-theorem-remark',
  proof: 'markdown-theorem-proof'
};

export class Theorem extends EditableNodeComponent {
  constructor(node: AstTheorem) {
    const element = document.createElement('section');
    const style = node.theorem.type.style;
    super(
      'theorem',
      node,
      element,
      `markdown-theorem ${THEOREM_CLASS[style] ?? 'markdown-theorem-custom'}`
    );
    element.setAttribute('data-theorem-type', node.theorem.type.className);

    const title = document.createElement('h4');
    title.className = 'markdown-theorem-title';
    title.setAttribute('data-chrome', 'true');
    const blockStart = renderingBlock()?.charStart ?? 0;
    const label =
      renderContext().theoremLabelAt(blockStart + node.theorem.from) ??
      node.theorem.type.displayName;
    title.appendChild(document.createTextNode(label));
    if (node.theorem.info !== '') {
      title.appendChild(document.createTextNode(' ('));
      const info = fragmentProcessor.parse(node.theorem.info);
      fragmentProcessor.runSync(info, { value: node.theorem.info });
      const paragraph = info.children[0];
      appendChildren(
        title,
        paragraph?.type === 'paragraph' && paragraph.children
          ? paragraph.children
          : [{ type: 'text', value: node.theorem.info }]
      );
      title.appendChild(document.createTextNode(')'));
    }
    title.appendChild(document.createTextNode('.'));
    title.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterSourceOf(this.element, node.theorem.markerFrom);
      (this.element.closest('.prose') as HTMLElement | null)?.focus({ preventScroll: true });
    }, true);
    element.appendChild(title);

    const body = document.createElement('div');
    body.className = 'markdown-theorem-body';
    appendChildren(body, node.children);
    if (node.children.length === 0) {
      const anchor = document.createElement('p');
      anchor.className = 'markdown-theorem-empty';
      setOffset(anchor, THEOREM_BODY_ANCHOR, node.theorem.bodyFrom);
      setOffset(anchor, TEXT_FROM, node.theorem.bodyFrom);
      anchor.appendChild(document.createTextNode(''));
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        enterSourceOf(this.element, node.theorem.bodyFrom);
        (this.element.closest('.prose') as HTMLElement | null)?.focus({
          preventScroll: true
        });
      });
      body.appendChild(anchor);
    }
    if (node.theorem.type.style === 'proof') {
      const qed = document.createElement('span');
      qed.className = 'markdown-theorem-qed';
      qed.setAttribute('data-chrome', 'true');
      qed.textContent = '□';
      const last = body.lastElementChild;
      (last?.tagName === 'P' ? last : body).appendChild(qed);
    }
    element.appendChild(body);
  }
}
