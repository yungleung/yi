/**
 * The app window: builds the shell — title bar, tree, editor panel, status bar — and wires the
 * services to it, once.
 *
 * May import: everything: this is the composition root, and the only module whose job is to know
 * the whole shell. Upholds: one construction of each widget and one wiring of the config, the
 * language and the session, so nothing else has to order them.
 */

import { platform } from '@tauri-apps/plugin-os';
import { eventManager } from './services/events';
import { StatusBar } from './ui/status_bar';
import { TitleBar } from './ui/title_bar';
import {
  ExportProgressStatus,
  LayoutStatus,
  SavedStatus,
  StackStatus,
  VersionStatus,
  WordsCountStatus
} from './ui/status_bar/index';
import { MarkdownEditor } from './ui/editor_panel';
import { Sidebar } from './ui/sidebar';
import { WorkspaceTree } from './ui/workspace';
import { ContentShell } from './ui/content_shell';
import { ResizeHandle } from './ui/resize_handle';
import { FormattingToolbar } from './ui/toolbar/index';
import { LinkToolbar } from './ui/toolbar/index';
import { ImageToolbar } from './ui/toolbar/index';
import { ListToolbar } from './ui/toolbar/index';
import { FootnoteToolbar } from './ui/toolbar/index';
import { TableToolbar } from './ui/toolbar/index';
import { SessionToolbar } from './ui/toolbar/index';
import { registerSessionCommands } from './ui/session';
import { registerNewDocumentCommand } from './ui/new_document';
import { registerVersionCommand } from './ui/versioning/index';
import { registerExportCommand } from './ui/export/workflow';
import {
  exportManager,
  registerExportManagerCommand
} from './ui/export/manager/index';
import { openTutorialForFirstStart, registerTutorialCommand } from './ui/tutorial/index';
import { registerDocumentationCommand } from './ui/documentation/index';
import { exportActivity } from './services/export_activity';
import { prompt } from './ui/prompt';
import { EDITOR_LAYOUT_CHANGED, type EditorLayout } from './ui/markdown/markdown_editor';
import { installMessages } from './ui/messages';
import { installHints } from './ui/hints';
import { runWorkspaceSetup } from './ui/workspace_setup/index';
import { needsWorkspaceQuestion } from './services/workspace';
import { workspaceManager, WORKSPACE_CHANGED } from './services/workspace';
import { configManager } from './services/config_manager';
import { documentSession } from './services/session';
import { bibliographyManager } from './services/bibliography';
import { openSettingsWindow } from './ui/settings/index';
import { imageFolderPath } from './services/settings_paths';
import { setImageFolder } from './ui/image/index';
import { applyLanguage, languageFor } from './services/language';
import { applyTheme, themeFor } from './services/theme';
import { language } from './services/i18n';

function createAppShell(): MarkdownEditor {
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
  const formattingToolbar = new FormattingToolbar();
  const linkToolbar = new LinkToolbar();
  const imageToolbar = new ImageToolbar();
  const listToolbar = new ListToolbar();
  const footnoteToolbar = new FootnoteToolbar();
  const tableToolbar = new TableToolbar();
  const layoutStatus = new LayoutStatus();
  const sessionToolbar = new SessionToolbar();
  const savedStatus = new SavedStatus();
  const stackStatus = new StackStatus();
  const versionStatus = new VersionStatus(() => editor.focusText());
  const exportProgress = new ExportProgressStatus();

  titleBar.mount(root);
  sidebar.mount(contentShell.element);
  sidebar.addSection(workspaceTree);
  resizeHandle.mount(contentShell.element);
  editor.mount(contentShell.element);
  contentShell.mount(root);
  statusBar.mount(root);
  // What the app tells the reader: the cards listen for `MESSAGE_EVENT` from here on.
  installMessages();
  // And what it only has to notice: a hint sits beside what it is about, and the next press ends it.
  installHints();

  titleBar.addComponent(formattingToolbar, 'center');
  titleBar.addComponent(linkToolbar, 'center');
  titleBar.addComponent(imageToolbar, 'center');
  titleBar.addComponent(listToolbar, 'center');
  titleBar.addComponent(footnoteToolbar, 'center');
  titleBar.addComponent(tableToolbar, 'center');
  titleBar.addComponent(sessionToolbar, 'right');

  sidebar.attachToTitleBar(titleBar.element);

  statusBar.addComponent(wordsCount, 'right');
  statusBar.addComponent(layoutStatus, 'right');
  statusBar.addComponent(stackStatus, 'right');
  statusBar.addComponent(savedStatus, 'right');
  // What is running belongs at the status bar's left, before the document's own facts.
  statusBar.addComponent(exportProgress, 'left');
  // And the versions of the note on screen follow it.
  statusBar.addComponent(versionStatus, 'left');

  // The session holds the documents; the editor panel is the view it drives.
  documentSession.attach(editor);
  documentSession.attachPrompter(prompt);
  // Its commands — Save, Save As, and the stack — registered where the session's behaviour is.
  registerSessionCommands();
  // And the one that makes a note: the menu item and the tree's own *New file* name it.
  registerNewDocumentCommand();
  registerTutorialCommand();
  registerDocumentationCommand();
  // And the one that keeps a version: the File menu's item names it, and nothing else ever runs git.
  registerVersionCommand();
  // And the one that writes the note out: the File menu's *Export* names it, and what it exports is
  // the text on screen rather than the session's debounced copy of it.
  registerExportCommand({ text: () => editor.getContent(), progress: exportActivity });
  registerExportManagerCommand(
    { focusEditor: () => editor.focusText() },
    exportManager
  );

  // Saving is the session's: a document may have been read from a file, may have no file yet,
  // and may be one of several — only the session knows which.
  void eventManager.on('save', () => void documentSession.save());
  void eventManager.on('save_as', () => void documentSession.saveAs());

  return editor;
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

async function initializeConfig(editor: MarkdownEditor): Promise<void> {
  try {
    const cfg = await configManager.load();

    if (cfg.workspace) {
      void eventManager.emit(WORKSPACE_CHANGED, cfg.workspace);
    }

    // The layout the reader left is the one they get, and the button that switches it is
    // remembered through the same config file as the bibliography (see `settings/`).
    // Applying it happens before the listener, so opening the app is not a change to save.
    editor.setLayout(cfg.editor_layout === 'auto' ? 'auto' : 'page');
    void eventManager.on(EDITOR_LAYOUT_CHANGED, (event: any) => {
      const chosen = (event?.payload ?? event) as EditorLayout;
      if (chosen === 'page' || chosen === 'auto') {
        void configManager.update({ editor_layout: chosen });
      }
    });

    // The folder an image is saved in is also the folder a relative image destination may be read
    // from, so the renderer is told it here — and told again whenever a setting is saved, which is
    // the only way it can change while the app is open (`settings/` announces every change).
    setImageFolder(await imageFolderPath());
    void eventManager.on('config_changed', () => {
      void (async () => {
        const cfg = await configManager.load();
        applyTheme(themeFor(cfg));
        // A language is not a label to redraw but a catalogue to read again, and every component
        // built its strings in its constructor: the window is reloaded instead, and the session
        // brings the document, the caret and the view back (`docs/ai-context.md`).
        if ((await languageFor(cfg)) !== language()) {
          location.reload();
          return;
        }
        setImageFolder(await imageFolderPath());
        editor.refresh();
      })();
    });

    // A fresh install has no workspace: ask once, and ask before the session restores a document —
    // a restored document opens into a window that has to know its folder.
    const firstStart = needsWorkspaceQuestion({
      workspace: cfg.workspace ?? null,
      workspace_asked: cfg.workspace_asked === true
    });
    if (firstStart) {
      await runWorkspaceSetup();
    }

    // The documents the reader had open, and where they were in them. After the workspace, so
    // a restored document opens into a window that already knows its folder.
    await documentSession.load();
    // A first start that restored nothing opens the tutorial, after the workspace question and
    // after the session: the reader's own restored note always wins, and the tutorial is a
    // reference they can leave by opening anything else.
    await openTutorialForFirstStart(firstStart);
  } catch (error) {
    console.error('Failed to load the app config:', error);
  }

  // Kick off the initial bibliography load; later changes flow through
  // CITATION_CONFIG_CHANGED -> reload -> CITATION_UPDATED -> editor refresh.
  await bibliographyManager.load();
}

window.addEventListener('DOMContentLoaded', async () => {
  await initializeEventListeners();
  const initialConfig = await configManager.load();
  // The language has to be known before the shell is built: every label is read once, in the
  // constructor of the component that shows it.
  await applyLanguage(initialConfig);
  applyTheme(themeFor(initialConfig));
  const editor = createAppShell();
  await initializeConfig(editor);
  console.log('DOM fully loaded and parsed');
});
