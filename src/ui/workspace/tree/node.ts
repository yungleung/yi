/**
 * One row in the workspace tree and the subtree it owns.
 *
 * A folder row expands into child rows and reconciles those rows in place; a file row opens its
 * document. Each row owns its DOM, menu, drag/drop and rename surface, while the tree facade above
 * it owns the workspace lifecycle.
 *
 * Example: refreshing an open folder reuses a child whose path is unchanged, so its expanded
 * children and listeners survive while a newly created sibling gets one new row.
 *
 * May import: the file listing, the living session, app events and messages, locale text, and the
 * tree's interaction/rules modules. Upholds: a row remains addressable by `data-tree-path`, and a
 * folder refresh changes only rows whose filesystem entries changed.
 */

import { listFolderFiles, type FileInfo } from '../../../api/files';
import { documentSession } from '../../../services/session';
import { eventManager } from '../../../services/events';
import { MESSAGE_EVENT } from '../../../services/messages';
import { t } from '../../../services/i18n';
import { makeDragSource, makeDropTarget } from './drag';
import { showTreeMenu } from './menu';
import type { TreeMenuEntry } from './menu_model';
import { dropEntry, renameEntryTo, runTreeAction } from './ops';
import { beginRename } from './rename';
import type { TreeEntry } from './rules';

export class TreeNode {
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

  constructor(info: FileInfo, level: number, isRoot = false) {
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
        next.push(node ?? new TreeNode(child, this.level + 1));
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
      fallback.textContent = t('tree.unableToLoad');
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
      // What a click opens is the session's decision, not the tree's: it knows what is on
      // screen, what the stack holds, and whether losing the one would lose work.
      await documentSession.openPath(this.info.path);
    } catch (error) {
      console.error('Failed to read file content:', error);
      void eventManager.emit(MESSAGE_EVENT, {
        text: t('tree.openFailed', {
          name: this.info.basename,
          message: error instanceof Error ? error.message : String(error)
        })
      });
    }
  }
}
