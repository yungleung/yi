/**
 * Draws the file list inside the export-template code panel.
 *
 * Example: `main.tex` is an editable row, while `reference.docx` shows its size
 * and an external-open button but no editor path.
 *
 * May import: template file facts and translations. Upholds: row names,
 * buttons and selectors remain stable; this module never reads or writes files.
 */

import type { TemplateFileInfo } from '../../../api/templates';
import { t } from '../../../services/i18n';

export interface TemplateFileActions {
  choose(file: string, editable: boolean): void;
  openExternally(file: string): void;
  canOpenExternally: boolean;
}

export function renderTemplateFiles(
  container: HTMLElement,
  files: TemplateFileInfo[],
  actions: TemplateFileActions
): void {
  container.replaceChildren();
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1 rounded px-1 py-1';
    row.setAttribute('data-template-file', file.name);
    const name = document.createElement('button');
    name.type = 'button';
    name.className =
      'min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-base-300';
    name.textContent = file.name;
    name.title = file.name;
    name.addEventListener('click', () => actions.choose(file.name, file.editable));
    row.append(name);
    if (!file.editable) {
      const size = document.createElement('span');
      size.className = 'text-[0.65rem] opacity-50';
      size.textContent = sizeLabel(file.size);
      row.append(size);
      if (actions.canOpenExternally && !file.name.endsWith('.json')) {
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn btn-ghost btn-xs px-1';
        open.textContent = '↗';
        open.title = t('template.openInSystem');
        open.setAttribute('aria-label', t('template.openInSystem'));
        open.addEventListener('click', () => actions.openExternally(file.name));
        row.append(open);
      }
    }
    container.append(row);
  }
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
