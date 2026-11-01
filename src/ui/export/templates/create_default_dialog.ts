/**
 * The two facts a package made from pandoc's own default still needs: a name, and where it came
 * from. The template itself is pandoc's, so there is nothing to inspect first.
 *
 * May import: the catalogue and the question card. Upholds: creating a package asks before it
 * writes one, and an empty name is refused in the card rather than by the backend.
 */

import { t } from '../../../services/i18n';
import { QuestionCard } from '../../floating';
import { kindLabel } from '../kind_label';

export interface DefaultTemplateAnswer {
  name: string;
  source: string | null;
  license: string | null;
}

export class CreateDefaultDialog extends QuestionCard<DefaultTemplateAnswer | null> {
  private readonly form: HTMLFormElement;
  private readonly name: HTMLInputElement;
  private readonly source: HTMLInputElement;
  private readonly license: HTMLInputElement;
  private readonly status: HTMLParagraphElement;
  private kind = '';

  constructor() {
    super('w-[32rem]');
    this.element.setAttribute('data-template-create-default', 'true');
    const heading = document.createElement('p');
    heading.className = 'mb-3 text-sm font-semibold';
    heading.textContent = t('template.createTitle');
    this.name = this.input('template-create-name', 'text');
    this.source = this.input('template-create-source', 'url');
    this.license = this.input('template-create-license', 'text');
    this.status = document.createElement('p');
    this.status.className = 'mt-2 min-h-4 text-xs text-error';
    this.status.setAttribute('data-template-create-status', 'true');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost btn-sm';
    cancel.textContent = t('template.cancel');
    cancel.addEventListener('click', () => this.settle(null));
    const create = document.createElement('button');
    create.type = 'submit';
    create.className = 'btn btn-primary btn-sm';
    create.textContent = t('template.create');
    create.setAttribute('data-template-create-run', 'true');
    const actions = document.createElement('div');
    actions.className = 'mt-3 flex justify-end gap-2';
    actions.append(cancel, create);
    this.form = document.createElement('form');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.name.value.trim();
      if (name === '') {
        this.status.textContent = t('template.nameEmpty');
        return;
      }
      this.settle({
        name,
        source: this.source.value.trim() || null,
        license: this.license.value.trim() || null
      });
    });
    this.form.append(
      heading,
      this.field(t('template.name'), this.name),
      this.field(t('template.source'), this.source),
      this.field(t('template.license'), this.license),
      this.status,
      actions
    );
  }

  protected cautious(): DefaultTemplateAnswer | null {
    return null;
  }

  async ask(kind: string): Promise<DefaultTemplateAnswer | null> {
    this.kind = kind;
    this.name.value = t('template.defaultName', { kind: kindLabel(this.kind) });
    this.source.value = '';
    this.license.value = '';
    this.status.textContent = '';
    const answered = this.askWith(() => this.card.append(this.form));
    this.name.focus();
    this.name.select();
    return await answered;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'mt-2 flex flex-col gap-1';
    const words = document.createElement('label');
    words.className = 'label-text text-xs';
    words.textContent = label;
    group.append(words, control);
    return group;
  }

  private input(name: string, type: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.className = 'input input-bordered input-sm w-full';
    input.setAttribute(`data-${name}`, 'true');
    return input;
  }
}

export const createDefaultDialog = new CreateDefaultDialog();
