import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { EventManager } from './events/event_manager';
import { TitleBar } from './ui/title_bar';
import { StatusBar } from './ui/status_bar';
import { MarkdownEditor } from './ui/markdown_editor';
import { Sidebar } from './ui/sidebar';
import { ContentShell } from './ui/content_shell';
import { ResizeHandle } from './ui/resize_handle';

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
  const sidebar = new Sidebar();
  const contentShell = new ContentShell();
  const resizeHandle = new ResizeHandle((width) => {
    sidebar.setWidth(width);
  }, 180, 420, sidebar.getWidth());

  titleBar.mount(root);
  sidebar.mount(contentShell.element);
  resizeHandle.mount(contentShell.element);
  editor.mount(contentShell.element);
  contentShell.mount(root);
  statusBar.mount(root);

  const titleActions = document.createElement('button');
  titleActions.className = 'btn btn-ghost btn-xs';
  titleActions.textContent = '⋯';
  titleBar.addComponent(titleActions, 'right');

  sidebar.attachToTitleBar(titleBar.element);

  const statusCenter = document.createElement('span');
  statusCenter.className = 'text-xs opacity-70';
  statusCenter.textContent = 'Line 1, Col 1';
  statusBar.addComponent(statusCenter, 'center');

  window.UI.titleBar = titleBar;
  window.UI.statusBar = statusBar;
  window.UI.editor = editor;
  window.UI.sidebar = sidebar;
  window.UI.resizeHandle = resizeHandle;
  window.UI.appRoot = root;
}

function initializeUI() {
  window.UI = window.UI || {};
  window.UI.platformName = window.UI.platformName || platform().toLowerCase();
  createAppShell();
  window.UI.eventManager = window.UI.eventManager || new EventManager();
}

function initializeEventListeners() {
  window.UI.eventManager.on('open_folder', (event: any) => {
    const workspacePath = event?.payload ?? event;
    window.UI.sidebar?.setWorkspace?.(workspacePath);
    console.log('Open folder event triggered:', event);
  });
}

import { initHighlightTheme } from './ui/highlightTheme';

window.addEventListener('DOMContentLoaded', () => {
  // initialize dynamic highlight.js theme loader before UI mounts
  initHighlightTheme();
  initializeUI();
  initializeEventListeners();
  console.log('DOM fully loaded and parsed');
});
