/**
 * The button at the left of the status bar: the newest version of the note on screen.
 *
 * It is there exactly when the reader has agreed to versions in this workspace — `versionsVisible`,
 * read from the config, so a workspace they said no to never runs git — and hidden otherwise; what
 * it *says* comes from `services/versions.ts` and nothing else. A press opens the panel under it
 * (`versions_panel.ts`, added next), which is the only thing that reads again.
 *
 * May import: the versions service, the config, the events, the catalogue, the toolbar base and the
 * panel. Upholds: one fact on screen — the newest version and when — drawn from the service.
 */

import { configManager } from '../../services/config_manager';
import { eventManager } from '../../services/event_manager';
import { t } from '../../services/i18n';
import { VERSIONS_CHANGED, versionsOfDocument } from '../../services/versions';
import { WORKSPACE_CHANGED } from '../../services/workspace';
import { versionedNow, versionStamp, versionsVisible } from '../../services/versioning';
import { DOCUMENT_SESSION_CHANGED, documentSession } from '../../services/session';
import { STATUS_BUTTON, Toolbar } from '../toolbar/toolbar';
import { VersionsPanel } from './versions_panel';

/** The reader's own glyph: a note's version. */
const VERSION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<path fill="currentColor" fill-rule="evenodd" d="M8 10.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M8 12c1.953 0 3.579-1.4 3.93-3.25h3.32a.75.75 0 0 0 0-1.5h-3.32a4.001 4.001 0 0 0-7.86 0H.75a.75.75 0 0 0 0 1.5h3.32A4 4 0 0 0 8 12" clip-rule="evenodd" />' +
  '</svg>';

export class VersionStatus extends Toolbar {
  private readonly button: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private readonly panel: VersionsPanel;

  constructor() {
    // `relative`, so the panel hangs under the button rather than somewhere in the page.
    super(['relative', 'flex', 'items-center', 'gap-1']);
    this.panel = new VersionsPanel();

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = ['btn', 'btn-ghost', STATUS_BUTTON].join(' ');
    this.button.setAttribute('data-version-status', 'true');
    this.button.innerHTML = VERSION_ICON;
    this.label = document.createElement('span');
    // The stamp sits in the same row as the app's other status words, so it is the same size and
    // weight they are: `btn` brings its own 600, which is the one thing a status bar never wants.
    this.label.className = 'ml-1 whitespace-nowrap text-xs font-normal opacity-70';
    this.label.setAttribute('data-version-status-label', 'true');
    this.button.appendChild(this.label);
    // A status button never takes the focus or starts a window drag.
    this.button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.button.addEventListener('click', () => this.panel.toggle());
    this.element.append(this.button, this.panel.element);

    void eventManager.on(VERSIONS_CHANGED, () => this.render());
    // What is *on screen* is what the label is about, so a keystroke can change it.
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => this.render());
    void eventManager.on(WORKSPACE_CHANGED, () => this.render());
    void eventManager.on('config_changed', () => this.render());
    this.render();
  }

  /** Shows itself where the reader agreed, and says what is newest — or that there is nothing. */
  private render(): void {
    const config = configManager.get();
    const workspace = config?.workspace ?? null;
    const shown = config !== null && workspace !== null && versionsVisible(config, workspace);
    // The *button* wears the answer, not the group around it: what a probe finds by
    // `[data-version-status]` has to be the thing that says whether the reader agreed.
    this.button.classList.toggle('hidden', !shown);
    if (!shown) {
      this.panel.close();
      return;
    }
    this.button.title = t('version.button');
    this.button.setAttribute('aria-label', this.button.title);
    const latest = versionsOfDocument.latest();
    const reading = versionsOfDocument.current();
    const newestText = reading.kind === 'ready' ? reading.newestText : null;
    const content = documentSession.current()?.content ?? '';
    this.label.textContent =
      latest === null
        ? t('version.none')
        : versionedNow(newestText, content)
          ? versionStamp(latest.at)
          : t('version.unversioned');
    this.button.setAttribute('data-version-state', versionsOfDocument.current().kind);
  }
}
