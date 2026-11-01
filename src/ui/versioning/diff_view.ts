/**
 * One version of the note on screen, whole, with what changed marked: the right column of the
 * history modal.
 *
 * It does not own the modal or Escape: the history modal does. It stays mounted in that modal's
 * right column and replaces its contents whenever another version is selected. The caret, the
 * selection and the scroll in the editor are the session's and are never touched here.
 *
 * What it shows is `services/text_diff.ts`: the whole note, one row per line, removals and additions
 * marked, opening at the first change rather than at the top. The text it compares is a snapshot:
 * the version's own text, and the text the document held when the selection changed.
 *
 * May import: the session, the config, the versioning seam, the diff rule and the catalogue.
 * Upholds: nothing it does writes to the repository — it reads a version and shows it.
 */

import { versioningVersionText } from '../../api/versioning';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { documentSession } from '../../services/session';
import { versionsOfDocument } from '../../services/versioning';
import { textDiff, type DiffLine } from '../../services/text_diff';
import { versionedNow } from '../../services/versioning';
import { prompt } from '../prompt';

/** How many differing lines the rule will look at before it names the change instead. */
const DIFF_CAP = 2000;

/** The version a reader asked to see. */
export interface VersionToSee {
  revision: string;
  path: string;
  stamp: string;
}
export class VersionDiffView {
  readonly element: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly said: HTMLParagraphElement;
  private readonly restore: HTMLButtonElement;
  private onRestored: (() => void) | null = null;
  private showing: VersionToSee | null = null;
  private versionText: string | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hidden min-h-0 flex-1 flex-col bg-base-100';
    this.element.setAttribute('tabindex', '-1');
    this.element.setAttribute('data-version-diff', 'true');

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
    this.title = document.createElement('span');
    this.title.className = 'flex-1 text-sm font-semibold';
    this.title.setAttribute('data-version-diff-title', 'true');
    this.restore = document.createElement('button');
    this.restore.type = 'button';
    this.restore.className = 'btn btn-primary btn-xs';
    this.restore.setAttribute('data-version-diff-restore', 'true');
    this.restore.hidden = true;
    this.restore.addEventListener('click', () => void this.putBack());
    header.append(this.title, this.restore);

    this.body = document.createElement('div');
    this.body.className = 'min-h-0 flex-1 overflow-auto px-3 py-2';
    this.body.setAttribute('data-version-diff-body', 'true');
    this.said = document.createElement('p');
    this.said.className = 'text-sm opacity-70';
    this.said.setAttribute('data-version-diff-empty', 'true');
    this.said.hidden = true;

    this.element.append(header, this.said, this.body);
  }

  /** The history modal owns the pane and closes itself after a successful restore. */
  mount(host: HTMLElement, onRestored: () => void): void {
    this.onRestored = onRestored;
    host.appendChild(this.element);
  }

  /** Shows one version against the text the document holds right now. */
  async show(version: VersionToSee): Promise<void> {
    const workspace = configManager.get()?.workspace ?? null;
    const document = documentSession.current();
    this.showing = version;
    this.versionText = null;
    this.title.textContent = t('version.diff.version', { stamp: version.stamp });
    this.clear();
    this.open();
    if (workspace === null || document?.path == null) {
      return;
    }
    let before: string;
    try {
      before = await versioningVersionText(workspace, version.revision, version.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Reading a version of this note:', error);
      this.say(message === 'This version is not text.' ? t('version.diff.notText') : message);
      return;
    }
    if (this.showing !== version) {
      // Another version was asked for while this read was running: its own show will draw.
      return;
    }
    this.versionText = before;
    this.render(textDiff(before, document.content, DIFF_CAP));
  }

  /**
   * Puts the version's text back, after one question: restore it, or cancel and nothing happens at
   * all. The question is the app's own prompt (`ui/prompt.ts`), so Escape is the answer that does
   * not act — which is the whole point of asking: a reader who pressed the button by mistake has a
   * way out that changes nothing.
   */
  private async putBack(): Promise<void> {
    const version = this.showing;
    const text = this.versionText;
    const path = documentSession.current()?.path ?? null;
    if (version === null || text === null || path === null) {
      return;
    }
    // Whether what is on screen is in a version at all: if it is not, the reader is told that the
    // text they are about to replace has never been kept anywhere (`version.restore.unversioned`).
    const reading = versionsOfDocument.current();
    const newestText = reading.kind === 'ready' ? reading.newestText : null;
    const words = t('version.restore.message', { stamp: version.stamp });
    const go = await prompt.ask({
      title: t('version.restore.title'),
      message: versionedNow(newestText, documentSession.current()?.content ?? '')
        ? words
        : `${words} ${t('version.restore.unversioned')}`,
      yes: t('version.restore.yes'),
      no: t('version.restore.no')
    });
    if (!go) {
      return;
    }
    await documentSession.openVersion(path, text);
    this.close();
    this.onRestored?.();
  }

  /** Empties the pane when the modal closes, without taking the modal itself away. */
  close(): void {
    this.showing = null;
    this.versionText = null;
    this.element.classList.add('hidden');
    this.element.classList.remove('flex');
    this.clear();
  }

  private open(): void {
    this.element.classList.remove('hidden');
    this.element.classList.add('flex');
    this.element.focus();
  }

  private clear(): void {
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    this.said.hidden = true;
    this.said.textContent = '';
    this.restore.hidden = true;
    this.restore.textContent = t('version.diff.restore');
  }

  /** One sentence instead of a stream: nothing changed, or nothing could be read. */
  private say(words: string): void {
    this.body.replaceChildren();
    this.said.textContent = words;
    this.said.hidden = false;
  }

  private render(stream: DiffLine[]): void {
    this.clear();
    if (stream.every((line) => line.kind === 'same')) {
      this.say(t('version.diff.none'));
      return;
    }
    this.restore.hidden = false;
    const rows = document.createDocumentFragment();
    for (const line of stream) {
      const row = document.createElement('div');
      row.className = 'whitespace-pre-wrap font-mono text-xs';
      row.setAttribute('data-version-diff-line', 'true');
      row.setAttribute('data-version-diff-kind', line.kind);
      if (line.kind === 'removed') {
        row.classList.add('markdown-diff-removed');
      } else if (line.kind === 'added') {
        row.classList.add('markdown-diff-added');
      } else {
        row.classList.add('opacity-70');
      }
      row.textContent =
        line.replaced === undefined
          ? line.text === ''
            ? '\u00a0'
            : line.text
          : t('version.diff.replaced', { count: line.replaced });
      rows.appendChild(row);
    }
    this.body.appendChild(rows);
    const changed = this.body.querySelector<HTMLElement>(
      '[data-version-diff-kind="removed"], [data-version-diff-kind="added"]'
    );
    if (changed !== null) {
      // Scroll only the diff pane. `scrollIntoView` also scrolls any ancestor it can, which moved
      // the whole modal and hid the history sidebar when the diff was taller than the panel.
      const bodyRect = this.body.getBoundingClientRect();
      const changedRect = changed.getBoundingClientRect();
      this.body.scrollTop = Math.max(
        0,
        changedRect.top -
          bodyRect.top -
          Math.round((this.body.clientHeight - changedRect.height) / 2)
      );
    }
  }
}
