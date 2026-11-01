/**
 * The card that asks about versions — the two things the app has to ask, and nothing else.
 *
 * It asks once about each thing and never decides either: *may Yi keep versions of this workspace
 * at all*, which is consent for one folder, and *the git directory will live outside a folder a
 * cloud drive could reach — go ahead*, which is the risk a synced folder earns. Both are the
 * plan's own questions (`services/versioning/rules.ts: versioningPlan`): this module draws the one it was
 * asked for, and knows nothing about git.
 *
 * The two hands are the app's own (`under_test.ts`) and say the same words: a reader gets the
 * system's dialog, which is modal and unmissable, and a probe gets the card, because a native
 * dialog blocks the webview the harness reaches the app through. Escape answers the cautious way
 * — no versions — and never the answer that acts.
 *
 * May import: the dialog plugin, the question card, the "under test" rule and the catalogue.
 * Upholds: one question at a time, and an answer that is always an answer to the plan's question.
 */

import { ask as askNative } from '@tauri-apps/plugin-dialog';
import { t } from '../../services/i18n';
import { QuestionCard } from '../floating';
import { drivenByTools } from '../under_test';

/** Which of the plan's two questions is being asked, and what its words have to name. */
export interface VersioningQuestion {
  ask: 'consent' | 'cloud-risk';
  /** The repository at hand, or the git directory one of ours would keep. */
  location: string | null;
  /** Whether the plan makes a repository of its own: the risk reads differently when it is theirs. */
  separated: boolean;
}

/** Whoever can ask. A module that needs the answer takes one of these rather than a card. */
export interface VersioningChooser {
  ask(question: VersioningQuestion): Promise<boolean>;
}

/** One question's words, read once so both hands say the same thing. */
interface Words {
  title: string;
  message: string;
  location: string | null;
  yes: string;
  no: string;
}

export class VersioningDialog extends QuestionCard<boolean> implements VersioningChooser {
  private readonly heading: HTMLParagraphElement;
  private readonly message: HTMLParagraphElement;
  private readonly where: HTMLParagraphElement;
  private readonly actions: HTMLDivElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;

  constructor() {
    super('w-[28rem]');
    this.element.dataset.versioning = 'true';

    this.heading = document.createElement('p');
    this.heading.className = 'mb-1 text-sm font-semibold';
    this.heading.setAttribute('data-versioning-title', 'true');
    this.message = document.createElement('p');
    this.message.className = 'text-sm';
    this.message.setAttribute('data-versioning-message', 'true');
    // The path is its own line because it is what a reader checks: where the versions live, spelled
    // out, rather than folded into a sentence.
    this.where = document.createElement('p');
    this.where.className = 'mt-2 break-all rounded bg-base-100 px-2 py-1 font-mono text-xs';
    this.where.setAttribute('data-versioning-location', 'true');

    this.actions = document.createElement('div');
    this.actions.className = 'mt-3 flex justify-end gap-2';
    this.no = this.makeButton('versioning-no', 'btn btn-ghost btn-sm', () => this.settle(false));
    this.yes = this.makeButton('versioning-yes', 'btn btn-primary btn-sm', () => this.settle(true));
    this.actions.append(this.no, this.yes);
  }

  /** Escape is the answer that does not act: no versions. */
  protected cautious(): boolean {
    return false;
  }

  /** Asks the plan's question: the system's dialog for a reader, the card for a probe. */
  async ask(question: VersioningQuestion): Promise<boolean> {
    const words = this.words(question);
    if (!drivenByTools()) {
      const message =
        words.location === null ? words.message : `${words.message}\n\n${words.location}`;
      return await askNative(message, { title: words.title, kind: 'warning' });
    }
    return await this.askWith(() => this.fill(words));
  }

  /** The question the plan asked for, in the app's words. */
  private words(question: VersioningQuestion): Words {
    if (question.ask === 'consent') {
      return {
        title: t('version.title'),
        message: t('version.consent'),
        location: null,
        yes: t('version.consent.yes'),
        no: t('version.consent.no')
      };
    }
    return {
      title: t('version.title'),
      message: question.separated ? t('version.risk') : t('version.riskTheirs'),
      location: question.location,
      yes: t('version.risk.yes'),
      no: t('version.risk.no')
    };
  }

  /** Draws one question into the card the kind owns. */
  private fill(words: Words): void {
    this.heading.textContent = words.title;
    this.message.textContent = words.message;
    this.where.textContent = words.location ?? '';
    this.where.classList.toggle('hidden', words.location === null);
    this.yes.textContent = words.yes;
    this.no.textContent = words.no;
    this.card.append(this.heading, this.message, this.where, this.actions);
  }

  private makeButton(name: string, className: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
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

/** The app's versioning question. One per app, asked by whoever needs the answer. */
export const versioningDialog = new VersioningDialog();
