import type { Root } from 'mdast';
import { BaseComponent } from '../ui/component';
import { parseMarkdown, serializeMarkdown } from './parser';
import { renderMarkdownAst } from './renderer';

const DEFAULT_MARKDOWN = [
  '# GitHub-flavored markdown demo',
  '',
  'This paragraph has *italic*, **bold**, ***both*** text, plus `inline code` and ~~strikethrough~~.',
  '',
  '## Task lists',
  '',
  '- [x] Completed task',
  '- [ ] Pending task',
  '- [ ] Another pending task with a [link](https://example.com)',
  '',
  '## Lists and links',
  '',
  '- Unordered list item',
  '- Another item with an autolink: https://example.com',
  '  - Nested item',
  '',
  '1. Ordered list item',
  '2. Another ordered item',
  '',
  '## Blockquotes and code',
  '',
  '> A blockquote with a [link](https://example.com)',
  '',
  '```ts',
  'function greet(name: string) {',
  '  console.log(`Hello, ${name}`);',
  '}',
  '```',
  '',
  '## Tables',
  '',
  '| Column 1 | Column 2 | Column 3 |',
  '| --- | --- | --- |',
  '| Alpha | Beta | Gamma |',
  '| Delta | Epsilon | Zeta |',
  '',
  '## Math expressions',
  '',
  'Inline math: $E = mc^2$ and $\\int_a^b x^2 \\, dx$.',
  '',
  'Display math:',
  '',
  '$$',
  '\\frac{d}{dx}(\\sin x) = \\cos x',
  '$$',
  '',
  '## Footnotes and definition lists',
  '',
  'Here is a sentence with a footnote.[^1]',
  '',
  '[^1]: This is the footnote content rendered as a definition-style note.',
  '',
  'Term one',
  '',
  ': Definition for the first term.',
  '',
  'Term two',
  '',
  ': Definition for the second term that can include a [link](https://example.com).',
  '',
  '## Images and separators',
  '',
  '![A sample image](https://placehold.co/200x80/png)',
  '',
  '---',
  '',
  'This demo shows GitHub-flavored markdown features such as task lists, autolinks, tables, and fenced code blocks.'
].join('\n');

export class WysiwygMarkdownEditor extends BaseComponent {
  private documentRoot: Root;
  private contentView: HTMLElement;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'overflow-hidden']);

    this.contentView = document.createElement('div');
    this.contentView.className = 'flex-1 min-h-0 overflow-auto p-4';
    this.appendChild(this.contentView);

    this.documentRoot = parseMarkdown(DEFAULT_MARKDOWN);
    this.renderPreview();
  }

  setContent(content: string): void {
    this.documentRoot = parseMarkdown(content);
    this.renderPreview();
  }

  getContent(): string {
    return serializeMarkdown(this.documentRoot);
  }

  private renderPreview(): void {
    const preview = renderMarkdownAst(this.documentRoot);
    this.contentView.replaceChildren(preview);
  }
}
