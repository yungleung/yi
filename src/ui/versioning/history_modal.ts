/**
 * The version history of the note on screen: a two-column modal with history on the left and the
 * selected version's diff on the right.
 *
 * It opens only when there is at least one version to show. A row never opens another surface:
 * choosing one keeps the modal where it is and replaces its right column. The modal owns Escape
 * and the keyboard while it is open; closing returns the keyboard to the editor through the
 * callback its host supplies.
 *
 * May import: the versions service, the events, the catalogue, the component base and the diff
 * pane. Upholds: the list is a view of the living history, one version is selected at a time, and
 * no empty or unreadable history opens a modal.
 */

import { eventManager } from '../../services/events';
import { t } from '../../services/i18n';
import { VERSIONS_CHANGED, versionsOfDocument } from '../../services/versioning';
import { versionStamp, versionTitle, type Version } from '../../services/versioning';
import { BaseComponent } from '../component';
import { VersionDiffView } from './diff_view';

export class VersionHistoryModal extends BaseComponent {
  private readonly panel: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly diff = new VersionDiffView();
  private selected: string | null = null;
  private opening = false;
  private readonly onClose: () => void;

  constructor(onClose: () => void) {
    super('div', [
      'fixed',
      'inset-0',
      'z-[70]',
      'hidden',
      'items-center',
      'justify-center',
      'bg-black/30'
    ]);
    this.onClose = onClose;
    this.element.setAttribute('data-version-history', 'true');
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'version-history-title');
    this.element.setAttribute('tabindex', '-1');

    this.panel = document.createElement('div');
    this.panel.className =
      'flex h-[min(48rem,90vh)] w-[min(72rem,95vw)] flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl';
    this.panel.setAttribute('data-version-history-panel', 'true');

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
    const title = document.createElement('h2');
    title.id = 'version-history-title';
    title.className = 'text-sm font-semibold';
    title.setAttribute('data-version-history-title', 'true');
    title.textContent = t('version.history.title');
    const spacer = document.createElement('span');
    spacer.className = 'flex-1';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-xs';
    close.setAttribute('data-version-history-close', 'true');
    close.setAttribute('aria-label', t('version.diff.close'));
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(title, spacer, close);

    const body = document.createElement('div');
    body.className = 'flex min-h-0 flex-1';
    const history = document.createElement('div');
    history.className =
      'w-64 shrink-0 overflow-auto border-r border-base-300 bg-base-200/50 p-2';
    history.setAttribute('data-version-history-list', 'true');
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col gap-1';
    this.list.setAttribute('data-version-list', 'true');
    history.appendChild(this.list);
    const right = document.createElement('div');
    right.className = 'flex min-h-0 min-w-0 flex-1 flex-col';
    this.diff.mount(right, () => this.close());
    body.append(history, right);
    this.panel.append(header, body);
    this.element.appendChild(this.panel);

    this.panel.addEventListener('mousedown', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (!event.isComposing && event.key === 'Escape' && this.isOpen()) {
        event.preventDefault();
        this.close();
      }
    });
    void eventManager.on(VERSIONS_CHANGED, () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  /** Reads once before opening: an empty, missing or unreadable history has nothing to show. */
  async open(): Promise<void> {
    if (this.isOpen() || this.opening) {
      return;
    }
    this.opening = true;
    try {
      await versionsOfDocument.reread();
      const reading = versionsOfDocument.current();
      if (reading.kind !== 'ready' || reading.versions.length === 0) {
        return;
      }
      if (this.element.parentElement === null) {
        document.body.appendChild(this.element);
      }
      this.element.classList.remove('hidden');
      this.element.classList.add('flex');
      this.element.focus();
      this.selected = null;
      this.render(reading);
    } finally {
      this.opening = false;
    }
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.element.classList.add('hidden');
    this.element.classList.remove('flex');
    this.selected = null;
    this.diff.close();
    this.onClose();
  }

  private render(reading = versionsOfDocument.current()): void {
    if (reading.kind !== 'ready' || reading.versions.length === 0) {
      this.close();
      return;
    }
    const versions = reading.versions;
    const selected =
      versions.find((version) => version.hash === this.selected) ?? versions[0];
    this.list.replaceChildren();
    for (const [index, version] of versions.entries()) {
      this.list.appendChild(this.row(version, index === 0));
    }
    this.select(selected);
  }

  private select(version: Version): void {
    this.selected = version.hash;
    for (const row of this.list.querySelectorAll<HTMLElement>('[data-version-row]')) {
      const chosen = row.getAttribute('data-version-row') === version.hash;
      row.setAttribute('data-version-selected', String(chosen));
      row.setAttribute('aria-pressed', String(chosen));
      row.classList.toggle('bg-base-300', chosen);
    }
    void this.diff.show({
      revision: version.hash,
      path: version.path,
      stamp: versionStamp(version.at)
    });
  }

  /** One row: the stamp, the message, and the comment under it. */
  private row(version: Version, isLatest: boolean): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rounded px-2 py-1.5 text-left hover:bg-base-300 cursor-pointer';
    row.setAttribute('data-version-row', version.hash);
    if (isLatest) {
      row.setAttribute('data-version-latest', 'true');
    }
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => this.select(version));
    const stamp = document.createElement('span');
    stamp.className = 'block text-xs opacity-70';
    stamp.setAttribute('data-version-stamp', 'true');
    stamp.textContent = versionStamp(version.at);
    const subject = document.createElement('span');
    subject.className = 'mt-0.5 block text-xs';
    subject.setAttribute('data-version-subject', 'true');
    subject.textContent = versionTitle(version.subject);
    row.append(stamp, subject);
    if (version.body.trim() !== '') {
      const comment = document.createElement('p');
      comment.className = 'mt-1 text-xs opacity-70';
      comment.setAttribute('data-version-comment-text', 'true');
      comment.textContent = version.body;
      row.appendChild(comment);
    }
    return row;
  }
}
