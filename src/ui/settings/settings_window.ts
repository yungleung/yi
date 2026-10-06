/**
 * The settings window: the tabs, and the one window they live in.
 *
 * May import: the tabs, the window API, the catalogue and the component base. Upholds: one settings
 * window per app — a second press focuses the one that is open rather than building another.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { t } from '../../services/i18n';
import { BaseComponent } from '../component';
import { CitationSettings } from './citation_settings';
import { GeneralSettings } from './general_settings';
import { NewDocumentSettings } from './new_document_settings';

/**
 * Opens the settings window, focusing it when it is already open.
 */
export async function openSettingsWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('settings');
  if (existing) {
    await existing.setFocus();
    return;
  }

  const settingsWindow = new WebviewWindow('settings', {
    url: 'settings.html',
    title: t('settings.title'),
    width: 760,
    height: 560,
    minWidth: 560,
    minHeight: 420,
    resizable: true,
  });
  settingsWindow.once('tauri://error', (event) => {
    console.error('Failed to open the settings window:', event);
  });
}

interface SettingsTab {
  id: string;
  label: string;
  content: BaseComponent;
}

/**
 * The settings window: a sidebar holding a stack of tabs, with the selected
 * tab's content rendered in the main area.
 *
 * The sidebar is a strip of tabs: each one spans the sidebar's own width, they sit flush against
 * each other with nothing between them, and the tab in hand carries the theme's active colour —
 * so the list reads as one control rather than as a menu of separate buttons.
 */
export class SettingsWindow extends BaseComponent {
  private readonly contentArea: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly tabs: SettingsTab[] = [];

  constructor() {
    super('div', [
      'flex',
      'h-screen',
      'w-screen',
      'overflow-hidden',
      'bg-base-100',
      'text-base-content'
    ]);

    const sidebar = document.createElement('aside');
    sidebar.className = 'w-36 shrink-0 bg-base-200 border-r border-base-300 overflow-y-auto';
    this.menu = document.createElement('ul');
    this.menu.className = 'menu w-full gap-0 p-0';
    sidebar.appendChild(this.menu);

    this.contentArea = document.createElement('main');
    this.contentArea.className = 'flex-1 min-w-0 overflow-y-auto p-6';

    this.appendChild(sidebar);
    this.appendChild(this.contentArea);

    this.addTab({
      id: 'general',
      label: t('settings.general'),
      content: new GeneralSettings()
    });
    this.addTab({
      id: 'citation',
      label: t('settings.citation'),
      content: new CitationSettings()
    });
    this.addTab({
      id: 'new-note',
      label: t('settings.newNote'),
      content: new NewDocumentSettings()
    });
    this.selectTab(this.tabs[0].id);
  }

  private addTab(tab: SettingsTab): void {
    const item = document.createElement('li');
    const button = document.createElement('a');
    button.href = '#';
    button.textContent = tab.label;
    // Full width and square: a tab, not a rounded menu row with air around it.
    button.className = 'w-full rounded-none';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this.selectTab(tab.id);
    });
    item.appendChild(button);
    this.menu.appendChild(item);
    this.tabs.push(tab);
  }

  private selectTab(id: string): void {
    const items = this.menu.querySelectorAll(':scope > li > a');
    for (const item of items) {
      item.classList.toggle('menu-active', false);
    }
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) {
      return;
    }
    items[index].classList.add('menu-active');
    this.contentArea.replaceChildren(this.tabs[index].content.element);
  }
}
