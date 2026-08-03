import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { EventManager } from './events/event_manager';
import { TitleBar } from './ui/title_bar';
import { StatusBar } from './ui/status_bar';
import { MarkdownEditor, MARKDOWN_CONTENT_CHANGED } from './ui/markdown_editor';
import { Sidebar } from './ui/sidebar';
import { WorkspaceTree } from './ui/workspace_tree';
import { ContentShell } from './ui/content_shell';
import { ResizeHandle } from './ui/resize_handle';
import { WordsCountStatus } from './ui/words_count';
import { Toast } from './ui/toast';
import { WorkspaceManager } from './services/workspace';
import { loadConfig } from './api/settings';

declare global {
  interface Window {
    UI?: any;
  }
}

function createAppShell() {
  const existingRoot = document.getElementById('app');
  const root = existingRoot ?? document.createElement('div');

  if (!existingRoot) {
    root.id = 'app';
    document.body.appendChild(root);
  }

  root.className = 'flex flex-col h-screen w-screen overflow-hidden bg-base-100 text-base-content';
  root.replaceChildren();

  window.UI.window = window.UI.window || getCurrentWindow();

  const titleBar = new TitleBar(window.UI.platformName);
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

  window.UI.titleBar = titleBar;
  window.UI.statusBar = statusBar;
  window.UI.editor = editor;
  window.UI.sidebar = sidebar;
  window.UI.workspaceTree = workspaceTree;
  window.UI.resizeHandle = resizeHandle;
  window.UI.wordsCount = wordsCount;
  window.UI.toast = toast;
  window.UI.appRoot = root;

  void window.UI.eventManager.emit(MARKDOWN_CONTENT_CHANGED, editor.getContent());
}

function initialize() {
  window.UI = window.UI || {};
  window.UI.platformName = window.UI.platformName || platform().toLowerCase();
  window.UI.eventManager = window.UI.eventManager || new EventManager();
}

async function initializeEventListeners() {
  await window.UI.eventManager.on('open_folder', (event: any) => {
    const workspacePath = event?.payload ?? event;
    void window.UI.workspaceManager?.openWorkspace(workspacePath);
    console.log('Open folder event triggered:', event);
  });

  await window.UI.eventManager.on(MARKDOWN_CONTENT_CHANGED, (event: any) => {
    const markdown = event?.payload ?? event;
    void window.UI.wordsCount?.update(markdown);
  });
}

async function initializeConfig(): Promise<void> {
  try {
    window.UI.config = await loadConfig();

    if (window.UI.config?.workspace) {
      window.UI.workspaceTree?.setWorkspace(window.UI.config.workspace);
    }
  } catch (error) {
    console.error('Failed to load the app config:', error);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  initialize();
  await initializeEventListeners();
  createAppShell();
  await initializeConfig();
  window.UI.workspaceManager = new WorkspaceManager();
  console.log('DOM fully loaded and parsed');
});
