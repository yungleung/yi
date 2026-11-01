/**
 * The workspace tree: the folder of markdown files, as a tree the author can work in.
 *
 * A row is one file or folder. Clicking it opens the file or folds the folder; a
 * right-click opens the menu (`menu.ts`, built from `menu_model.ts`); a row
 * can be dragged into a folder (`drag.ts`); and a name can be edited where it sits
 * (`rename.ts`). The work each of those asks for lives in `ops.ts`, which is
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

import { eventManager } from '../../../services/events';
import { WORKSPACE_CHANGED } from '../../../services/workspace';
import { t } from '../../../services/i18n';
import { SidebarSection } from '../../sidebar_section';
import { TreeNode } from './node';
import { setTreeHost, type TreeHost } from './ops';

/** Emitted with the file content when the user opens a document from the tree. */
export const DOCUMENT_OPENED = 'document_opened';

export class WorkspaceTree extends SidebarSection implements TreeHost {
  readonly root: string = '';
  private rootNode: TreeNode | null = null;

  constructor() {
    super(t('sidebar.workspace'));
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
    empty.textContent = t('tree.empty');
    this.content.appendChild(empty);
  }

  private basename(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? path;
  }
}

export { refreshTreeFolders } from './ops';
export type { TreeHost } from './ops';
export {
  dropDecision,
  nameSelection,
  nameWithoutExtension
} from './rules';
export type { DropDecision, TreeEntry } from './rules';
export {
  treeMenuActions,
  treeMenuNodes
} from './menu_model';
export type {
  TreeMenuAction,
  TreeMenuEntry,
  TreeMenuNode
} from './menu_model';
export type { RenameTarget } from './rename';
