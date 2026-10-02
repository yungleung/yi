/**
 * One version of the note on screen, whole, with what changed marked — a mode, not a floating
 * surface.
 *
 * It covers the editor's area and **keeps the keyboard while it is open**: the editor's caret stays
 * alive behind it, and `FloatingSurface`'s rule — that a surface never takes the focus — is right
 * for a question asked mid-gesture and wrong for this, because a keystroke reaching a document
 * nobody can see is worse than a modal. Escape or its ✕ closes it, and the host is told, so the
 * keyboard can go back to the text (`markdown_editor.ts: focusText`). The caret, the selection and
 * the scroll are the session's and are never touched here.
 *
 * What it shows is `services/text_diff.ts`: the whole note, one row per line, removals and additions
 * marked, opening at the first change rather than at the top. The text it compares is a snapshot:
 * the version's own text, and the text the document held when the sheet opened.
 *
 * May import: the session, the config, the versioning seam, the diff rule and the catalogue.
 * Upholds: nothing it does writes to the repository — it reads a version and shows it.
 */

import { versioningVersionText } from '../../api/versioning';
import { configManager } from '../../services/config_manager';
import { t } from '../../services/i18n';
import { documentSession } from '../../services/session';
import { textDiff, type DiffLine } from '../../services/text_diff';

/** How many differing lines the rule will look at before it names the change instead. */
const DIFF_CAP = 2000;

/** The version a reader asked to see. */
export interface VersionToSee {
  revision: string;
  path: string;
  stamp: string;
}

export class VersionDiffView {
  private readonly element: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly said: HTMLParagraphElement;
  private onClose: (() => void) | null = null;
  private showing: VersionToSee | null = null;
  private versionText: string | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'absolute inset-0 z-40 hidden flex-col bg-base-100';
    this.element.setAttribute('tabindex', '-1');
    this.element.setAttribute('data-version-diff', 'true');

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-base-300 px-3 py-2';
    this.title = document.createElement('span');
    this.title.className = 'flex-1 text-sm font-semibold';
    this.title.setAttribute('data-version-diff-title', 'true');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-xs';
    close.setAttribute('data-version-diff-close', 'true');
    close.setAttribute('aria-label', t('version.diff.close'));
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(this.title, close);

    this.body = document.createElement('div');
    this.body.className = 'flex-1 overflow-auto px-3 py-2';
    this.body.setAttribute('data-version-diff-body', 'true');
    this.said = document.createElement('p');
    this.said.className = 'text-sm opacity-70';
    this.said.setAttribute('data-version-diff-empty', 'true');
    this.said.hidden = true;

    this.element.append(header, this.said, this.body);
    // Escape is the way out, wherever the keyboard is: the sheet is the only thing on screen.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  /** Its host owns it: this is the box the sheet covers, and the way the keyboard comes back. */
  mount(host: HTMLElement, onClose: () => void): void {
    this.onClose = onClose;
    host.appendChild(this.element);
  }

  isOpen(): boolean {
    return !this.element.classList.contains('hidden');
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

  /** The version's own text, once it has been read — what a restore writes (the next task). */
  shownText(): string | null {
    return this.versionText;
  }

  /** Puts the sheet away and hands the keyboard back to the text. */
  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.showing = null;
    this.element.classList.add('hidden');
    this.onClose?.();
  }

  private open(): void {
    this.element.classList.remove('hidden');
    this.element.focus();
  }

  private clear(): void {
    this.body.replaceChildren();
    this.said.hidden = true;
    this.said.textContent = '';
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
    const rows = document.createDocumentFragment();
    for (const line of stream) {
      const row = document.createElement('div');
      row.className = 'whitespace-pre-wrap font-mono text-xs';
      row.setAttribute('data-version-diff-line', 'true');
      row.setAttribute('data-version-diff-kind', line.kind);
      if (line.kind === 'removed') {
        row.classList.add('text-error');
      } else if (line.kind === 'added') {
        row.classList.add('text-success');
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
    this.body
      .querySelector('[data-version-diff-kind="removed"], [data-version-diff-kind="added"]')
      ?.scrollIntoView({ block: 'center' });
  }
}

/** The app's one version sheet. */
export const versionDiffView = new VersionDiffView();
