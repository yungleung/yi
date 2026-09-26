/**
 * The workspace tree: the folder of markdown files, as a tree the author can work in.
 *
 * A row is one file or folder. Clicking it opens the file or folds the folder; a
 * right-click opens the menu (`tree_menu.ts`, built from `tree_menu_model.ts`); a row
 * can be dragged into a folder (`tree_drag.ts`); and a name can be edited where it sits
 * (`tree_rename.ts`). The work each of those asks for lives in `tree_ops.ts`, which is
 * registered here as the tree on screen, so the menu, the drop and a probe all run the
 * same code.
 *
 * The rows carry their path as `data-tree-path`, which is how the tree finds a row again
 * after a change and how a probe addresses one.
 *
 * May import: the backend's listing (`api/files`), the app's events, the sidebar's
 * section, and the tree's own modules. Upholds: the tree is a view of the folder — it
 * re-reads the disk after every change rather than patching rows by hand, and keeps the
 * folders the reader had open.
 */

import { readTextFile } from '@tauri-apps/plugin-fs';
import { listFolderFiles, type FileInfo } from '../../api/files';
import { eventManager } from '../../services/event_manager';
import { TOAST_EVENT, WORKSPACE_CHANGED } from '../../services/workspace';
import { SidebarSection } from '../sidebar_section';
import { makeDragSource, makeDropTarget } from './tree_drag';
import { showTreeMenu } from './tree_menu';
import type { TreeMenuEntry } from './tree_menu_model';
import { dropEntry, renameEntryTo, runTreeAction, setTreeHost, type TreeHost } from './tree_ops';
import { beginRename } from './tree_rename';
import type { TreeEntry } from './tree_rules';

/** Emitted with the file content when the user opens a document from the tree. */
export const DOCUMENT_OPENED = 'document_opened';

class TreeNode {
  private readonly tree: WorkspaceTree;
  private readonly info: FileInfo;
  private readonly level: number;
  private readonly isRoot: boolean;
  private readonly element: HTMLLIElement;
  private readonly row: HTMLButtonElement;
  private readonly childrenContainer: HTMLUListElement;
  private readonly arrow: HTMLSpanElement;
  private readonly label: HTMLSpanElement;
  private children: TreeNode[] = [];
  private expanded = false;
  private loaded = false;

  private readonly fileIconStyle = 'text-center text-xs opacity-70';

  private readonly folderExpandedIconStyle = 'arrow-down-rounded text-center text-xs opacity-70';
  private readonly folderCollapsedIconStyle = 'arrow-forward-rounded text-center text-xs opacity-70';

  constructor(tree: WorkspaceTree, info: FileInfo, level: number, isRoot = false) {
    this.tree = tree;
    this.info = info;
    this.level = level;
    this.isRoot = isRoot;
    this.element = document.createElement('li');
    this.element.className = 'list-none';

    this.row = document.createElement('button');
    this.row.type = 'button';
    this.row.className = [
      'w-full',
      'flex',
      'items-center',
      'gap-1',
      'rounded',
      'px-2',
      'py-1',
      'text-left',
      'text-xs',
      'hover:bg-base-300',
      'transition-colors'
    ].join(' ');
    this.row.style.paddingLeft = `${8 + this.level * 10}px`;
    // The row's address, for the tree itself (after a change) and for a probe.
    this.row.dataset.treePath = this.info.path;
    this.row.addEventListener('click', () => {
      // While the name is being renamed the row is a text field, not a link: a click in
      // the editable label is the author placing the caret.
      if (this.label.isContentEditable) {
        return;
      }
      if (this.info.is_file) {
        void this.openFile();
        return;
      }
      void this.toggle();
    });
    this.row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const entry = this.menuEntry();
      void showTreeMenu(entry, { x: event.clientX, y: event.clientY }, (action) => {
        void runTreeAction(action, entry);
      });
    });

    this.arrow = document.createElement('span');
    this.arrow.className = this.info.is_file ? this.fileIconStyle : this.folderCollapsedIconStyle;

    this.label = document.createElement('span');
    this.label.className = 'truncate';
    this.label.textContent = this.info.basename;

    this.row.append(this.arrow, this.label);
    makeDragSource(this.row, this.entry(), this.isRoot);
    makeDropTarget(this.row, this.entry(), (dragged) => {
      void dropEntry(dragged, this.info.path);
    });

    this.childrenContainer = document.createElement('ul');
    this.childrenContainer.className = 'min-w-0';
    this.childrenContainer.style.display = 'none';

    this.element.append(this.row, this.childrenContainer);
  }

  /** The entry as the rules and the operations see it. */
  entry(): TreeEntry {
    return { path: this.info.path, basename: this.info.basename, isFile: this.info.is_file };
  }

  /** The entry as the menu sees it, which knows the workspace's own row. */
  private menuEntry(): TreeMenuEntry {
    return { ...this.entry(), isRoot: this.isRoot };
  }

  render(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  async toggle(): Promise<void> {
    if (this.info.is_file) {
      return;
    }
    this.expanded = !this.expanded;
    this.updateArrow();
    this.childrenContainer.style.display = this.expanded ? 'block' : 'none';

    if (this.expanded && !this.loaded) {
      await this.loadChildren();
    }
  }

  /** Whether this folder is open. */
  get open(): boolean {
    return this.expanded;
  }

  /** The node for `path` among the folders already open, or null when it is not there. */
  find(path: string): TreeNode | null {
    if (this.info.path === path) {
      return this;
    }
    if (this.info.is_file || !path.startsWith(`${this.info.path}/`)) {
      return null;
    }
    for (const child of this.children) {
      const found = child.find(path);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /** Re-reads this folder's own entries, and nothing else in the tree. */
  async refresh(): Promise<void> {
    if (this.info.is_file) {
      return;
    }
    if (!this.expanded) {
      // None of it is on screen: whatever it holds will be listed afresh when it opens.
      this.loaded = false;
      this.children = [];
      this.childrenContainer.replaceChildren();
      return;
    }
    await this.loadChildren();
  }

  /** The node for `path`, opening the folders above it on the way down. */
  async reveal(path: string): Promise<TreeNode | null> {
    if (this.info.path === path) {
      // A reveal shows what is inside the folder it names, not just where it is.
      if (!this.info.is_file && !this.expanded) {
        await this.toggle();
      }
      return this;
    }
    if (this.info.is_file || !path.startsWith(`${this.info.path}/`)) {
      return null;
    }
    if (!this.expanded) {
      await this.toggle();
    }
    for (const child of this.children) {
      const found = await child.reveal(path);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /** Every folder of this subtree the reader has opened. */
  openedPaths(into: string[] = []): string[] {
    if (this.expanded) {
      into.push(this.info.path);
    }
    this.children.forEach((child) => child.openedPaths(into));
    return into;
  }

  /** Puts the row's own name into edit mode, the way the menu's Rename does. */
  startRename(): void {
    beginRename({
      label: this.label,
      basename: this.info.basename,
      isFile: this.info.is_file,
      commit: (name) => renameEntryTo(this.entry(), name)
    });
  }

  private async loadChildren(): Promise<void> {
    try {
      const children = await listFolderFiles(this.info.path);
      // What the folder holds is reconciled with what its rows are: an entry that is still
      // there keeps its row — and with it its open folders, its listeners and the row a
      // drag is over — instead of every row being written again. Only a folder that has
      // really changed (a move, a rename, a new file) is touched at all, and the rest of
      // the tree is not looked at: that is what keeps a change from flashing the tree.
      const existing = new Map(this.children.map((node) => [node.info.path, node]));
      const next: TreeNode[] = [];
      for (const child of children) {
        const node = existing.get(child.path);
        existing.delete(child.path);
        next.push(node ?? new TreeNode(this.tree, child, this.level + 1));
      }
      for (const gone of existing.values()) {
        gone.element.remove();
      }
      this.children = next;
      next.forEach((node, index) => {
        const current = this.childrenContainer.children[index];
        if (current !== node.element) {
          this.childrenContainer.insertBefore(node.element, current ?? null);
        }
      });
      this.loaded = true;
    } catch (error) {
      console.error('Failed to load workspace entries:', error);
      this.childrenContainer.replaceChildren();
      const fallback = document.createElement('li');
      fallback.className = 'text-xs opacity-70 px-2';
      fallback.textContent = 'Unable to load folder contents.';
      this.childrenContainer.appendChild(fallback);
    }
  }

  private updateArrow(): void {
    if (this.info.is_file) {
      this.arrow.className = this.fileIconStyle;
      this.arrow.removeAttribute('style');
      return;
    }
    this.arrow.className = this.expanded
      ? this.folderExpandedIconStyle
      : this.folderCollapsedIconStyle;
    this.arrow.removeAttribute('style');
  }

  private async openFile(): Promise<void> {
    try {
      const content = await readTextFile(this.info.path);
      void eventManager.emit(DOCUMENT_OPENED, content);
    } catch (error) {
      console.error('Failed to read file content:', error);
      void eventManager.emit(
        TOAST_EVENT,
        `Failed to open ${this.info.basename}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export class WorkspaceTree extends SidebarSection implements TreeHost {
  readonly root: string = '';
  private rootNode: TreeNode | null = null;

  constructor() {
    super('Workspace');
    this.content.dataset.workspaceTree = 'true';
    this.renderEmptyState();
    setTreeHost(this);
    // React to workspace changes without being registered globally.
    void eventManager.on(WORKSPACE_CHANGED, (event: any) => {
      const path = event?.payload ?? event;
      void this.setWorkspace(path);
    });
  }

  async setWorkspace(path: string | null): Promise<void> {
    this.content.replaceChildren();
    (this as { root: string }).root = path ?? '';
    if (!path) {
      this.rootNode = null;
      this.renderEmptyState();
      return;
    }

    this.rootNode = new TreeNode(
      this,
      {
        path,
        basename: this.basename(path),
        is_file: false
      },
      0,
      true
    );

    // Render into the cleared content area (not the whole section element),
    // so switching workspaces replaces the previous tree instead of stacking.
    this.rootNode.render(this.content);
    await this.rootNode.toggle();
  }

  /**
   * Re-reads these folders — and only these — leaving every other row where it is.
   *
   * A change on the disk touched one or two folders; rebuilding the tree would drop the
   * rows the change never reached, which flashes the tree and can fold folders the reader
   * had open.
   */
  async refreshFolders(paths: string[]): Promise<void> {
    for (const path of new Set(paths)) {
      await this.rootNode?.find(path)?.refresh();
    }
  }

  /** Whether a folder is open now. */
  isOpen(path: string): boolean {
    return this.rootNode?.find(path)?.open ?? false;
  }

  /** Opens `path`'s folder and puts its row into edit mode. */
  async renameAt(path: string): Promise<void> {
    const node = await this.rootNode?.reveal(path);
    node?.startRename();
  }

  /** Opens `path`'s folder, so a row inside a folded folder can be seen. */
  async reveal(path: string): Promise<void> {
    await this.rootNode?.reveal(path);
  }

  private renderEmptyState(): void {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-base-content/70';
    empty.textContent = 'Open a folder to view the workspace structure.';
    this.content.appendChild(empty);
  }

  private basename(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? path;
  }
}
