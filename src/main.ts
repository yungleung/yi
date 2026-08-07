import { platform } from '@tauri-apps/plugin-os';
import { eventManager } from './services/event_manager';
import { TitleBar } from './ui/title_bar';
import { StatusBar } from './ui/status_bar';
import { MarkdownEditor, MARKDOWN_CONTENT_CHANGED } from './ui/markdown_editor';
import { Sidebar } from './ui/sidebar';
import { WorkspaceTree } from './ui/workspace_tree';
import { ContentShell } from './ui/content_shell';
import { ResizeHandle } from './ui/resize_handle';
import { WordsCountStatus } from './ui/words_count';
import { Toast } from './ui/toast';
import { workspaceManager, WORKSPACE_CHANGED } from './services/workspace';
import { configManager } from './services/config_manager';
import { bibliographyManager } from './services/bibliography';
import { openSettingsWindow } from './ui/settings/settings_window';

function createAppShell() {
  const existingRoot = document.getElementById('app');
  const root = existingRoot ?? document.createElement('div');

  if (!existingRoot) {
    root.id = 'app';
    document.body.appendChild(root);
  }

  root.className = 'flex flex-col h-screen w-screen overflow-hidden bg-base-100 text-base-content';
  root.replaceChildren();

  const titleBar = new TitleBar(platform().toLowerCase());
  const editor = new MarkdownEditor();
  const statusBar = new StatusBar();
  const wordsCount = new WordsCountStatus();
  const sidebar = new Sidebar();
  const workspaceTree = new WorkspaceTree();
  const contentShell = new ContentShell();
  const resizeHandle = new ResizeHandle((width) => {
    sidebar.setWidth(width);
  }, 180, 420, sidebar.getWidth());
  const toast = new Toast();

  titleBar.mount(root);
  sidebar.mount(contentShell.element);
  sidebar.addSection(workspaceTree);
  resizeHandle.mount(contentShell.element);
  editor.mount(contentShell.element);
  contentShell.mount(root);
  statusBar.mount(root);
  toast.mount(document.body);

  const titleActions = document.createElement('button');
  titleActions.className = 'btn btn-ghost btn-xs';
  titleActions.textContent = '⋯';
  titleBar.addComponent(titleActions, 'right');

  sidebar.attachToTitleBar(titleBar.element);

  statusBar.addComponent(wordsCount, 'right');

  // Seed the initial word count (the component's own event listener may not
  // be registered yet when the first MARKDOWN_CONTENT_CHANGED emit fires).
  void wordsCount.update(editor.getContent());
  void eventManager.emit(MARKDOWN_CONTENT_CHANGED, editor.getContent());
}

async function initializeEventListeners() {
  await eventManager.on('open_folder', (event: any) => {
    const workspacePath = event?.payload ?? event;
    void workspaceManager.openWorkspace(workspacePath);
    console.log('Open folder event triggered:', event);
  });

  await eventManager.on('setting', () => {
    void openSettingsWindow();
  });
}

async function initializeConfig(): Promise<void> {
  try {
    const cfg = await configManager.load();

    if (cfg.workspace) {
      void eventManager.emit(WORKSPACE_CHANGED, cfg.workspace);
    }
  } catch (error) {
    console.error('Failed to load the app config:', error);
  }

  // Kick off the initial bibliography load; later changes flow through
  // CITATION_CONFIG_CHANGED -> reload -> CITATION_UPDATED -> editor refresh.
  await bibliographyManager.load();
}

window.addEventListener('DOMContentLoaded', async () => {
  await initializeEventListeners();
  createAppShell();
  await initializeConfig();
  console.log('DOM fully loaded and parsed');
});
