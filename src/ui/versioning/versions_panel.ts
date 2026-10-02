/**
 * The versions of the note on screen, as a list to read.
 *
 * It takes the shape of the stack popover: a panel that hangs under the button that opened it and
 * closes on Escape and on a press outside. No row acts — restoring a version is out of this slice's
 * scope — so the only things the panel does are open, read once for the freshest answer, and draw.
 *
 * May import: the versions service, the events, the catalogue and the panel base. Upholds: the list
 * is a view of the service, built from `versionsOfDocument.current()` whenever it opens or changes
 * while it is open.
 */

import { eventManager } from '../../services/event_manager';
import { t } from '../../services/i18n';
import { VERSIONS_CHANGED, versionsOfDocument, type VersionsReading } from '../../services/versions';
import { versionStamp, type Version } from '../../services/versioning';
import { AnchoredPanel } from '../floating/panel';
import { versionDiffView } from './version_diff_view';

export class VersionsPanel extends AnchoredPanel {
  private readonly list: HTMLDivElement;

  constructor() {
    // `left-0`, inside the `relative` toolbar that hosts it — the button it hangs under is the
    // leftmost thing in the status bar — and `above`, because the status bar is the bottom strip of
    // the window: a panel below it would be off-screen.
    super({ className: 'w-80 p-1 left-0', side: 'above' });
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col max-h-80 overflow-auto';
    this.list.setAttribute('data-version-list', 'true');
    this.element.appendChild(this.list);
    void eventManager.on(VERSIONS_CHANGED, () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  /** Shows the versions as they stand, and reads once for the freshest answer. */
  open(): void {
    this.render();
    super.open();
    // It hangs above a button at the bottom of the window, so it may not be taller than the room
    // there is above it: with no minimum window height (`tauri.conf.json`), the 320px cap of its list
    // would otherwise push its own top past the window's edge.
    const room = Math.round(this.element.getBoundingClientRect().bottom - 8);
    this.list.style.maxHeight = `${Math.max(80, room)}px`;
    void versionsOfDocument.reread().then(() => this.render());
  }

  private render(): void {
    this.list.replaceChildren();
    const reading = versionsOfDocument.current();
    const empty = this.said(reading);
    if (empty !== null) {
      this.list.appendChild(empty);
      return;
    }
    const versions = reading.kind === 'ready' ? reading.versions : [];
    for (const [index, version] of versions.entries()) {
      this.list.appendChild(this.row(version, index === 0));
    }
  }

  /** What to say instead of a list, or null when there is a list to draw. */
  private said(reading: VersionsReading): HTMLElement | null {
    const words =
      reading.kind === 'no-file'
        ? t('version.noFile')
        : reading.kind === 'no-repository'
          ? t('version.noRepository')
          : reading.kind === 'unreadable'
            ? t('version.unreadable')
            : reading.versions.length === 0
              ? t('version.empty')
              : null;
    if (words === null) {
      return null;
    }
    const said = document.createElement('p');
    said.className = 'px-2 py-1 text-xs opacity-70';
    said.setAttribute('data-version-empty', 'true');
    said.setAttribute('data-version-state', reading.kind);
    said.textContent = words;
    return said;
  }

  /** One row: the stamp, the message, and the comment under it. Nothing here acts. */
  private row(version: Version, isLatest: boolean): HTMLElement {
    // A row is a button: pressing it shows that version against what is on screen now, and the
    // panel gets out of the way.
    const row = document.createElement('button');
    row.type = 'button';
    // A clickable row says so: the pointer, and a step darker than the panel's own `base-200` when
    // the mouse is on it — the same two things the stack popover's rows and the new-note card's
    // folders do.
    row.className = 'rounded px-1 py-1 text-left hover:bg-base-300 cursor-pointer';
    row.setAttribute('data-version-open', version.hash);
    row.setAttribute('data-version-row', version.hash);
    if (isLatest) {
      row.setAttribute('data-version-latest', 'true');
    }
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    row.addEventListener('click', () => {
      this.close();
      void versionDiffView.show({
        revision: version.hash,
        path: version.path,
        stamp: versionStamp(version.at)
      });
    });
    const stamp = document.createElement('span');
    stamp.className = 'mr-2 text-xs opacity-70';
    stamp.setAttribute('data-version-stamp', 'true');
    stamp.textContent = versionStamp(version.at);
    const subject = document.createElement('span');
    subject.className = 'text-xs';
    subject.setAttribute('data-version-subject', 'true');
    subject.textContent = version.subject;
    const head = document.createElement('div');
    head.className = 'flex items-baseline gap-1';
    head.append(stamp, subject);
    row.appendChild(head);
    if (version.body.trim() !== '') {
      const comment = document.createElement('p');
      comment.className = 'mt-0.5 text-xs opacity-70';
      comment.setAttribute('data-version-comment-text', 'true');
      comment.textContent = version.body;
      row.appendChild(comment);
    }
    return row;
  }
}
