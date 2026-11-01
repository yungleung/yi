/**
 * A small question for the template whose metadata a new note should begin with.
 *
 * It is a card for every caller: the placement question already uses the system sheet for a
 * reader, and no native surface can carry this second answer. The cautious answer is `undefined`,
 * while no template at all is the explicit value `null`.
 *
 * May import: the component's floating base, the kind label and the catalogue. Upholds: a picked
 * template is returned by id only and is never written into the app config.
 */

import { t } from '../../services/i18n';
import type { NewNoteTemplate } from '../../services/new_document';
import { QuestionCard } from '../floating/question_card';
import { kindLabel } from '../export/templates';

export class NewDocumentTemplatePicker extends QuestionCard<string | null | undefined> {
  constructor() {
    super('w-[24rem]');
    this.element.setAttribute('data-new-document-template-card', 'true');
  }

  protected cautious(): undefined {
    return undefined;
  }

  async choose(templates: NewNoteTemplate[]): Promise<string | null | undefined> {
    if (templates.length === 0) {
      return null;
    }
    return await this.askWith(() => {
      const heading = document.createElement('p');
      heading.className = 'mb-3 text-sm font-semibold';
      heading.textContent = t('newNote.templateTitle');

      const select = document.createElement('select');
      select.className = 'select select-bordered select-sm w-full';
      select.setAttribute('data-new-document-template', 'true');
      select.append(this.option('', t('newNote.withoutTemplate')));
      for (const template of templates) {
        select.append(
          this.option(
            template.id,
            template.source === 'built-in'
              ? template.name
              : `${template.name} — ${kindLabel(template.kind)}`
          )
        );
      }
      const actions = document.createElement('div');
      actions.className = 'mt-4 flex justify-end gap-2';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-ghost btn-sm';
      cancel.textContent = t('newNote.cancel');
      cancel.setAttribute('data-new-document-template-cancel', 'true');
      cancel.addEventListener('click', () => this.settle(undefined));
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'btn btn-primary btn-sm';
      create.textContent = t('newNote.create');
      create.setAttribute('data-new-document-template-create', 'true');
      create.addEventListener('click', () => this.settle(select.value || null));
      actions.append(cancel, create);
      this.card.append(heading, select, actions);
    });
  }

  private option(value: string, label: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }
}

export const newDocumentTemplatePicker = new NewDocumentTemplatePicker();
