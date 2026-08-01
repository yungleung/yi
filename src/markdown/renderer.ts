import katex from 'katex';
import hljs from 'highlight.js';
import type { Parent, Root, RootContent } from 'mdast';

export function renderMarkdownAst(root: Root): HTMLElement {
  const container = document.createElement('div');
  // Use leading-6 (1.5) and prose-tight to reduce paragraph / list spacing
  container.className = 'prose prose-slate leading-6 prose-tight w-full max-w-full';

  root.children.forEach((node) => {
    const nodeElement = renderNode(node);
    if (nodeElement) {
      container.appendChild(nodeElement);
    }
  });

  return container;
}

function renderNode(node: RootContent | any): HTMLElement | Text | null {
  switch (node.type) {
    case 'paragraph':
      return createBlock('p', node, renderNode);
    case 'heading':
      return createBlock(`h${Math.min(Math.max(node.depth ?? 1, 1), 6)}`, node, renderNode);
    case 'blockquote':
      return createBlock('blockquote', node, renderNode);
    case 'list':
      return renderList(node);
    case 'listItem':
      return renderListItem(node);
    case 'descriptionlist':
      return renderDescriptionList(node);
    case 'descriptionterm':
      return renderDescriptionTerm(node);
    case 'descriptiondetails':
      return renderDescriptionDetails(node);
    case 'footnoteDefinition':
      return renderFootnoteDefinition(node);
    case 'footnoteReference':
      return renderFootnoteReference(node);
    case 'inlineMath':
      return renderMath(node, false);
    case 'math':
      return renderMath(node, true);
    case 'code':
      return renderCodeBlock(node);
    case 'thematicBreak':
      return createBlock('hr', node, null);
    case 'table':
      return renderTable(node);
    case 'html':
      return createBlock('pre', node, (n) => document.createTextNode(String((n as any).value || '')));
    case 'break':
      return document.createElement('br');
    case 'inlineCode':
      return createInline('code', node, renderTextNode);
    case 'emphasis':
      return createInline('em', node, renderNode);
    case 'strong':
      return createInline('strong', node, renderNode);
    case 'delete':
      return createInline('del', node, renderNode);
    case 'link':
      return renderLink(node);
    case 'image':
      return renderImage(node);
    case 'imageReference':
    case 'definition':
      return null;
    case 'text':
      return renderTextNode(node);
    default:
      return createBlock('div', node, renderChildren);
  }
}

function createBlock(
  tagName: string,
  node: RootContent | any,
  renderInner: ((child: RootContent | any) => Node | null) | null,
  extraClasses = ''
): HTMLElement {
  const wrapper = document.createElement(tagName);
  wrapper.className = ['min-w-0', extraClasses].filter(Boolean).join(' ');

  if (renderInner) {
    const children = (node as Parent).children || [];
    children.forEach((child: RootContent) => {
      const childNode = renderInner(child);
      if (childNode) {
        wrapper.appendChild(childNode);
      }
    });
  }

  return wrapper;
}

function createInline(
  tagName: string,
  node: RootContent | any,
  renderInner: (child: RootContent | any) => Node | null,
  extraClasses = ''
): HTMLElement {
  const element = document.createElement(tagName);
  element.className = extraClasses;
  if ((node as Parent).children) {
    (node as Parent).children.forEach((child: RootContent) => {
      const childNode = renderInner(child);
      if (childNode) {
        element.appendChild(childNode);
      }
    });
  } else if ((node as any).value) {
    element.textContent = String((node as any).value);
  }
  return element;
}

function renderChildren(node: RootContent | any): Node | null {
  if ((node as Parent).children) {
    const fragment = document.createDocumentFragment();
    (node as Parent).children.forEach((child: RootContent) => {
      const childNode = renderNode(child);
      if (childNode) {
        fragment.appendChild(childNode);
      }
    });
    return fragment;
  }
  return null;
}

function renderTextNode(node: RootContent | any): Text {
  return document.createTextNode(String((node as any).value ?? ''));
}

function renderList(node: any): HTMLElement {
  const list = document.createElement(node.ordered ? 'ol' : 'ul');
  list.className = 'min-w-0';

  (node.children || []).forEach((child: any) => {
    const listItem = renderNode(child);
    if (listItem) {
      list.appendChild(listItem);
    }
  });

  return list;
}

function renderTable(node: any): HTMLElement {
  const table = document.createElement('table');
  table.className = 'w-full';

  const rows = node.children || [];
  if (rows.length === 0) {
    return table;
  }

  const headerRow = rows[0];
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  (headerRow.children || []).forEach((cell: any) => {
    const th = document.createElement('th');
    th.appendChild(renderTableCell(cell));
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.slice(1).forEach((row: any) => {
    const tr = document.createElement('tr');
    (row.children || []).forEach((cell: any) => {
      const td = document.createElement('td');
      td.appendChild(renderTableCell(cell));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}

function renderTableCell(cell: any): HTMLElement {
  const content = document.createElement('div');

  (cell.children || []).forEach((child: any) => {
    const childNode = renderNode(child);
    if (childNode) {
      content.appendChild(childNode);
    }
  });

  return content;
}

function renderListItem(node: any): HTMLElement {
  const item = document.createElement('li');

  if (typeof node.checked === 'boolean') {
    item.classList.add('list-none');

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'flex items-start gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = true;
    checkbox.checked = node.checked;
    checkbox.className = 'mt-1 shrink-0';
    contentWrapper.appendChild(checkbox);

    (node.children || []).forEach((child: any) => {
      const childNode = renderNode(child);
      if (childNode) {
        if (child.type === 'paragraph' && childNode instanceof HTMLElement) {
          childNode.classList.add('my-0');
        }
        contentWrapper.appendChild(childNode);
      }
    });

    item.appendChild(contentWrapper);
    return item;
  }

  (node.children || []).forEach((child: any) => {
    const childNode = renderNode(child);
    if (childNode) {
      item.appendChild(childNode);
    }
  });
  return item;
}

function renderDescriptionList(node: any): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'my-3';

  (node.children || []).forEach((child: any) => {
    if (child.type === 'descriptionterm') {
      const term = document.createElement('dt');
      term.className = 'font-semibold mt-2';
      (child.children || []).forEach((grandChild: any) => {
        const childNode = renderNode(grandChild);
        if (childNode) {
          term.appendChild(childNode);
        }
      });
      list.appendChild(term);
    } else if (child.type === 'descriptiondetails') {
      const description = document.createElement('dd');
      description.className = 'ml-4 mb-2';
      (child.children || []).forEach((grandChild: any) => {
        const childNode = renderNode(grandChild);
        if (childNode) {
          description.appendChild(childNode);
        }
      });
      list.appendChild(description);
    }
  });

  return list;
}

function renderDescriptionTerm(node: any): HTMLElement {
  const term = document.createElement('dt');
  term.className = 'font-semibold mt-2';
  (node.children || []).forEach((child: any) => {
    const childNode = renderNode(child);
    if (childNode) {
      term.appendChild(childNode);
    }
  });
  return term;
}

function renderDescriptionDetails(node: any): HTMLElement {
  const description = document.createElement('dd');
  description.className = 'ml-4 mb-2';
  (node.children || []).forEach((child: any) => {
    const childNode = renderNode(child);
    if (childNode) {
      description.appendChild(childNode);
    }
  });
  return description;
}

function renderFootnoteDefinition(node: any): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'mt-3 text-sm';

  const id = String(node.identifier || node.label || 'note');
  const anchor = document.createElement('a');
  anchor.id = `fn-${id}`;
  anchor.className = 'mr-2 font-semibold inline-block align-top';
  anchor.textContent = `[${id}]`;
  wrapper.appendChild(anchor);

  const content = document.createElement('span');
  content.className = 'inline';

  // Flatten paragraph children to inline content so the footnote number and text stay on the same line
  (node.children || []).forEach((child: any) => {
    if (child.type === 'paragraph') {
      const frag = renderChildren(child);
      if (frag) content.appendChild(frag);
    } else {
      const childNode = renderNode(child);
      if (childNode) content.appendChild(childNode);
    }
  });

  wrapper.appendChild(content);

  return wrapper;
}

function renderFootnoteReference(node: any): HTMLElement {
  const wrapper = document.createElement('sup');
  const link = document.createElement('a');
  const id = String(node.identifier || node.label || 'note');
  link.href = `#fn-${id}`;
  link.className = 'text-primary font-medium';
  link.textContent = `[${id}]`;
  link.id = `fnref-${id}`;
  wrapper.appendChild(link);
  return wrapper;
}

function renderMath(node: any, displayMode: boolean): HTMLElement {
  const wrapper = document.createElement(displayMode ? 'div' : 'span');
  wrapper.className = displayMode ? 'my-4 overflow-x-auto' : 'mx-1 align-middle';

  try {
    const html = katex.renderToString(String(node.value ?? ''), {
      displayMode,
      throwOnError: false,
      output: 'html'
    });
    wrapper.innerHTML = html;
  } catch (error) {
    wrapper.textContent = String(node.value ?? '');
  }

  return wrapper;
}

function renderCodeBlock(node: any): HTMLElement {
  const wrapper = document.createElement('pre');
  wrapper.className = 'overflow-x-auto';
  const code = document.createElement('code');
  const text = String(node.value ?? '');
  code.className = node.lang ? `language-${node.lang}` : '';

  try {
    if (node.lang && hljs.getLanguage && hljs.getLanguage(node.lang)) {
      const highlighted = hljs.highlight(text, { language: node.lang, ignoreIllegals: true }).value;
      code.innerHTML = highlighted;
    } else {
      const auto = hljs.highlightAuto(text);
      code.innerHTML = auto.value;
    }
  } catch (err) {
    code.textContent = text;
  }

  wrapper.appendChild(code);
  return wrapper;
}

function renderLink(node: any): HTMLElement {
  const anchor = document.createElement('a');
  anchor.href = node.url || '#';
  anchor.target = '_blank';
  anchor.rel = 'noreferrer noopener';
  (node.children || []).forEach((child: RootContent) => {
    const childNode = renderNode(child);
    if (childNode) anchor.appendChild(childNode);
  });
  return anchor;
}

function renderImage(node: any): HTMLElement {
  const img = document.createElement('img');
  img.src = node.url || '';
  img.alt = node.alt || '';
  img.title = node.title || '';
  img.className = 'max-w-full';
  return img;
}

