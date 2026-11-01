/**
 * The template editor's modal DOM shell and top-level keyboard binding.
 *
 * Example: the shell builds the title, dirty marker, file column, code host, status area and
 * Save/Validate/Test PDF/Close controls, then reports those controls back to the lifecycle owner.
 *
 * May import: locale text and browser DOM APIs. Upholds: every existing selector and class remains
 * stable while package state and file operations stay outside the shell.
 */

import { t } from '../../../services/i18n';

export interface TemplateEditorShellHandlers {
  save(): void;
  validate(): void;
  testPdf(): void;
  requestClose(): void;
  handleEscape(): boolean;
}

export interface TemplateEditorShell {
  element: HTMLDivElement;
  title: HTMLSpanElement;
  dirtyMark: HTMLSpanElement;
  files: HTMLDivElement;
  editorHost: HTMLDivElement;
  status: HTMLParagraphElement;
  saveButton: HTMLButtonElement;
  validateButton: HTMLButtonElement;
  testPdfButton: HTMLButtonElement;
}

function button(
  name: string,
  label: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = label;
  control.setAttribute(`data-template-editor-${name}`, 'true');
  control.addEventListener('click', onClick);
  return control;
}

export function createTemplateEditorShell(
  handlers: TemplateEditorShellHandlers
): TemplateEditorShell {
  const element = document.createElement('div');
  element.className = 'fixed inset-0 z-[70] hidden items-center justify-center bg-black/30';
  element.setAttribute('data-template-editor', 'true');

  const panel = document.createElement('div');
  panel.className =
    'flex h-[min(48rem,90vh)] w-[min(72rem,95vw)] flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl';
  panel.setAttribute('data-template-editor-panel', 'true');

  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
  const title = document.createElement('span');
  title.className = 'text-sm font-semibold';
  title.setAttribute('data-template-editor-title', 'true');
  const dirtyMark = document.createElement('span');
  dirtyMark.className = 'text-xs text-warning';
  dirtyMark.setAttribute('data-template-editor-dirty', 'true');
  dirtyMark.textContent = '';
  const spacer = document.createElement('span');
  spacer.className = 'flex-1';
  const saveButton = button(
    'save',
    t('template.save'),
    'btn btn-primary btn-xs',
    handlers.save
  );
  const validateButton = button(
    'validate',
    t('template.validate'),
    'btn btn-ghost btn-xs',
    handlers.validate
  );
  const testPdfButton = button(
    'test-pdf',
    t('template.testPdf'),
    'btn btn-ghost btn-xs',
    handlers.testPdf
  );
  const close = button('close', '✕', 'btn btn-ghost btn-xs', handlers.requestClose);
  close.setAttribute('aria-label', t('template.close'));
  header.append(title, dirtyMark, spacer, saveButton, validateButton, testPdfButton, close);

  const body = document.createElement('div');
  body.className = 'flex min-h-0 flex-1';
  const files = document.createElement('div');
  files.className =
    'w-56 shrink-0 overflow-auto border-r border-base-300 bg-base-200/50 p-2';
  files.setAttribute('data-template-editor-files', 'true');
  const right = document.createElement('div');
  right.className = 'flex min-w-0 flex-1 flex-col';
  const editorHost = document.createElement('div');
  editorHost.className = 'min-h-0 flex-1 overflow-hidden';
  editorHost.setAttribute('data-template-editor-code', 'true');
  const status = document.createElement('p');
  status.className =
    'max-h-32 overflow-auto whitespace-pre-wrap border-t border-base-300 px-3 py-2 text-xs opacity-80';
  status.setAttribute('data-template-editor-status', 'true');
  right.append(editorHost, status);
  body.append(files, right);
  panel.append(header, body);
  element.append(panel);

  // A press in the panel belongs to the panel, not to the window drag behind it.
  panel.addEventListener('mousedown', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      event.defaultPrevented ||
      !handlers.handleEscape()
    ) {
      return;
    }
    event.preventDefault();
  });

  return {
    element,
    title,
    dirtyMark,
    files,
    editorHost,
    status,
    saveButton,
    validateButton,
    testPdfButton
  };
}
