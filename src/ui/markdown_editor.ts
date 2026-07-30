import { BaseComponent } from './component';

export class MarkdownEditor extends BaseComponent {
  readonly textarea: HTMLTextAreaElement;

  constructor() {
    super('div', ['flex', 'flex-1', 'min-h-0', 'bg-base-100', 'p-3']);

    this.textarea = document.createElement('textarea');
    this.textarea.className = [
      'textarea',
      'textarea-bordered',
      'w-full',
      'h-full',
      'min-h-0',
      'bg-base-100',
      'text-base-content',
      'font-mono',
      'text-sm',
      'leading-6'
    ].join(' ');
    this.textarea.placeholder = 'Write your markdown here...';
    this.textarea.value = '# Welcome\n\nStart writing your document here.';

    this.element.appendChild(this.textarea);
  }
}
