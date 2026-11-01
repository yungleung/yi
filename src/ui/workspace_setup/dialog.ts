/**
 * The card the first start asks on: make a workspace, or open a folder the reader already has.
 *
 * The reader is owed the answer to "where" before they choose, so the card says where the folder
 * would be made (`documentDir()`'s own path plus the name) rather than leaving them to find out by
 * pressing. Which hand answers "a folder I already have" is read from the page
 * (`ui/under_test.ts`), the way the prompt and the new-note card decide theirs: a reader gets the
 * system's folder picker, a probe gets a path field on this card, and both hands answer with the
 * same `WorkspaceSetupAnswer`.
 *
 * May import: the question card, the app's words, the folder picker and the under-test rule.
 * Upholds: one question at a time — the kind's own rule — and one answer, whether it came from the
 * system or from this card.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { t } from '../../services/i18n';
import { QuestionCard } from '../floating';
import { drivenByTools } from '../under_test';

/** What the card needs to ask: where a new workspace would be made. */
export interface WorkspaceSetupRequest {
  defaultFolder: string;
}

/** The reader's answer: make one, open `path`, or nothing at all. */
export type WorkspaceSetupAnswer = { create: true } | { path: string } | null;

/** Whoever can ask. A module that needs an answer takes one of these. */
export interface WorkspaceChooser {
  choose(request: WorkspaceSetupRequest): Promise<WorkspaceSetupAnswer>;
}

export class WorkspaceSetupDialog extends QuestionCard<WorkspaceSetupAnswer> implements WorkspaceChooser {
  private readonly heading: HTMLParagraphElement;
  private readonly message: HTMLParagraphElement;
  private readonly where: HTMLParagraphElement;
  private readonly pathRow: HTMLDivElement;
  private readonly pathField: HTMLInputElement;
  private readonly complaint: HTMLParagraphElement;
  private readonly actions: HTMLDivElement;

  constructor() {
    super('w-[26rem]');
    this.element.setAttribute('data-workspace-setup', 'true');

    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.textContent = t('workspace.setup.title');

    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.textContent = t('workspace.setup.message');

    this.where = document.createElement('p');
    this.where.className = 'mt-2 text-xs opacity-70';
    this.where.setAttribute('data-workspace-setup-where', 'true');

    this.complaint = document.createElement('p');
    this.complaint.className = 'mt-1 min-h-4 text-xs opacity-70';
    this.complaint.setAttribute('data-workspace-setup-complaint', 'true');

    this.pathRow = document.createElement('div');
    this.pathRow.className = 'mt-3 hidden flex-col gap-1';
    const caption = document.createElement('span');
    caption.className = 'text-xs opacity-70';
    caption.textContent = t('workspace.setup.path');
    this.pathField = document.createElement('input');
    this.pathField.type = 'text';
    this.pathField.className = 'input input-bordered input-sm w-full';
    this.pathField.setAttribute('data-workspace-setup-path', 'true');
    this.pathField.setAttribute('spellcheck', 'false');
    // The field and the answer it gives are one hand: they appear together, for a probe only.
    const use = this.button(
      'workspace-setup-use',
      t('workspace.setup.use'),
      'btn btn-primary btn-sm self-end',
      () => this.useTyped()
    );
    this.pathRow.append(caption, this.pathField, use);

    this.actions = document.createElement('div');
    this.actions.className = 'mt-3 flex flex-wrap justify-end gap-2';
    this.actions.append(
      this.button('workspace-setup-later', t('workspace.setup.later'), 'btn btn-ghost btn-sm', () =>
        this.settle(null)
      ),
      this.button(
        'workspace-setup-choose',
        t('workspace.setup.useExisting'),
        'btn btn-ghost btn-sm',
        () => void this.useExisting()
      ),
      this.button(
        'workspace-setup-create',
        t('workspace.setup.create'),
        'btn btn-primary btn-sm',
        () => this.settle({ create: true })
      )
    );
  }

  /** Escape means "not now": nothing is made, and the next start asks again. */
  protected cautious(): WorkspaceSetupAnswer {
    return null;
  }

  /** Asks, and answers with whatever the reader chose. */
  async choose(request: WorkspaceSetupRequest): Promise<WorkspaceSetupAnswer> {
    this.where.textContent = t('workspace.setup.where', { folder: request.defaultFolder });
    this.pathField.value = request.defaultFolder;
    this.complaint.textContent = '';
    this.pathRow.classList.add('hidden');
    this.pathRow.classList.remove('flex');
    return await this.askWith(() =>
      this.card.append(
        this.heading,
        this.message,
        this.where,
        this.complaint,
        this.pathRow,
        this.actions
      )
    );
  }

  /**
   * "A folder I already have": the system's picker for a reader, a path field for a probe — the
   * same two hands the prompt and the new-note card give their questions.
   */
  private async useExisting(): Promise<void> {
    if (drivenByTools()) {
      this.pathRow.classList.remove('hidden');
      this.pathRow.classList.add('flex');
      this.pathField.focus();
      this.pathField.select();
      return;
    }
    const chosen = await open({ directory: true, multiple: false });
    if (typeof chosen === 'string') {
      this.settle({ path: chosen });
    }
  }

  /** The path the field holds, or a word about why it will not do. */
  private useTyped(): void {
    const path = this.pathField.value.trim();
    if (path === '') {
      this.complaint.textContent = t('workspace.setup.needPath');
      return;
    }
    this.settle({ path });
  }

  private button(
    name: string,
    label: string,
    className: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    // By attribute, not by `dataset`: a `dataset` key with a hyphen in it is a SyntaxError in
    // WebKit, and these are named for the probe that presses them.
    button.setAttribute(`data-${name}`, 'true');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', onPress);
    return button;
  }
}

/** The app's workspace card. One per app. */
export const workspaceSetupDialog = new WorkspaceSetupDialog();
