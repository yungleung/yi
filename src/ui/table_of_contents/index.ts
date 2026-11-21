/**
 * The document's Table of Contents sidebar view.
 *
 * Example: the default fixture lists its level-one title, its level-two sections, and their
 * level-three headings; pressing one mounts and focuses that heading in the editor.
 *
 * May import: the neutral sidebar contract, the sidebar section and view contracts, the typed
 * document-change event, and the catalogue. Upholds: headings come from the editor's document
 * state, and this view keeps no second copy of the markdown.
 */

import { DOCUMENT_CHANGED, eventManager } from '../../services/events';
import { t } from '../../services/i18n';
import type { SidebarViewName } from '../../contracts';
import { SidebarSection } from '../sidebar_section';
import type { SidebarView } from '../sidebar';

/** One heading as the contents view needs it. */
export interface ContentsEntry {
  readonly id: string;
  readonly title: string;
  readonly from: number;
  readonly level: number;
}

/** What the contents view asks of the editor that owns the document. */
export interface ContentsPort {
  headings(): readonly ContentsEntry[];
  navigate(offset: number): void;
}

export class TableOfContents extends SidebarSection implements SidebarView {
  readonly id: SidebarViewName = 'contents';
  private frame: number | null = null;

  constructor(private readonly port: ContentsPort) {
    super(t('sidebar.contents'));
    this.element.setAttribute('data-sidebar-view', this.id);
    this.element.setAttribute('data-table-of-contents', 'true');
    void eventManager.on(DOCUMENT_CHANGED, () => this.schedule());
    this.render();
  }

  activate(): void {
    this.render();
  }

  deactivate(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private schedule(): void {
    if (!this.element.isConnected || this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  private render(): void {
    const entries = this.port.headings();
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'px-3 py-2 text-sm text-base-content/60';
      empty.textContent = t('sidebar.contents.empty');
      this.content.replaceChildren(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'menu menu-sm w-full py-0';
    for (const entry of entries) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'whitespace-normal text-left leading-5 py-0.5';
      button.style.paddingInlineStart = `${8 + Math.max(0, entry.level - 1) * 12}px`;
      button.setAttribute('data-toc-entry', entry.id);
      button.setAttribute('data-level', String(entry.level));
      button.setAttribute('aria-level', String(entry.level));
      button.textContent = entry.title;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.port.navigate(entry.from);
      });
      item.appendChild(button);
      list.appendChild(item);
    }
    this.content.replaceChildren(list);
  }
}
