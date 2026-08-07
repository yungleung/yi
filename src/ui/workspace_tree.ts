import { readTextFile } from '@tauri-apps/plugin-fs';
import { listFolderFiles, type FileInfo } from '../api/files';
import { eventManager } from '../services/event_manager';
import { WORKSPACE_CHANGED } from '../services/workspace';
import { SidebarSection } from './sidebar_section';

class TreeNode {
  private readonly tree: WorkspaceTree;
  private readonly info: FileInfo;
  private readonly level: number;
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

  constructor(tree: WorkspaceTree, info: FileInfo, level: number) {
    this.tree = tree;
    this.info = info;
    this.level = level;
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
    this.row.addEventListener('click', () => {
      if (this.info.is_file) {
        void this.openFile();
        return;
      }

      void this.toggle();
    });

    this.arrow = document.createElement('span');
    this.arrow.className = this.info.is_file ? this.fileIconStyle : this.folderCollapsedIconStyle;

    this.label = document.createElement('span');
    this.label.className = 'truncate';
    this.label.textContent = this.info.basename;

    this.row.append(this.arrow, this.label);

    this.childrenContainer = document.createElement('ul');
    this.childrenContainer.className = 'min-w-0';
    this.childrenContainer.style.display = 'none';

    this.element.append(this.row, this.childrenContainer);
  }

  render(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  async toggle(): Promise<void> {
    if (!this.info.is_file) {
      this.expanded = !this.expanded;
      this.updateArrow();
      this.childrenContainer.style.display = this.expanded ? 'block' : 'none';

      if (this.expanded && !this.loaded) {
        await this.loadChildren();
      }
    }
  }

  private async loadChildren(): Promise<void> {
    try {
      const children = await listFolderFiles(this.info.path);
      this.children = children.map((child) => new TreeNode(this.tree, child, this.level + 1));
      this.childrenContainer.replaceChildren();
      this.children.forEach((child) => child.render(this.childrenContainer));
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
      if (typeof window !== 'undefined' && (window as any).UI?.editor?.setContent) {
        (window as any).UI.editor.setContent(content);
      }
    } catch (error) {
      console.error('Failed to read file content:', error);
    }
  }
}

export class WorkspaceTree extends SidebarSection {
  private rootNode: TreeNode | null = null;

  constructor() {
    super('Workspace');
    this.renderEmptyState();
    // React to workspace changes without being registered globally.
    void eventManager.on(WORKSPACE_CHANGED, (event: any) => {
      const path = event?.payload ?? event;
      this.setWorkspace(path);
    });
  }

  setWorkspace(path: string | null): void {
    this.content.replaceChildren();
    if (!path) {
      this.renderEmptyState();
      return;
    }

    this.rootNode = new TreeNode(this, {
      path,
      basename: this.basename(path),
      is_file: false
    }, 0);

    // Render into the cleared content area (not the whole section element),
    // so switching workspaces replaces the previous tree instead of stacking.
    this.rootNode.render(this.content);
    void this.rootNode.toggle();
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
