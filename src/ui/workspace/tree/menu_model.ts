/**
 * What the workspace tree's context menu offers for an entry: the groups, in order, and
 * what each item is called.
 *
 * The menu itself is native (`menu.ts`), the way the table's is — and a native menu
 * can be neither read nor driven by a test (`docs/testing.md`: nothing can choose an item
 * of it but a person). So the model is what is written down and checked
 * (`test/checks/check-tree-menu.mjs`, beside `check-table-menu.mjs`), and every item's
 * action is a command a probe runs directly.
 *
 * An item that cannot mean anything for the entry is left out rather than shown grey:
 * a file has no contents to add a file to, and a folder has no frontmatter to copy an id
 * from. The workspace's own row is a folder that must not be renamed or deleted, so it
 * offers only what cannot hurt it.
 *
 * May import: nothing. Upholds: one fact about the tree's menu has one home, this one.
 */

/** Everything the menu can ask for. */
export type TreeMenuAction =
  | 'rename'
  | 'delete'
  | 'new-file'
  | 'new-folder'
  | 'reveal'
  | 'copy-path'
  | 'copy-name'
  | 'copy-id';

/** One item, or the line between two groups. */
export type TreeMenuNode =
  | { kind: 'separator' }
  | { kind: 'item'; id: TreeMenuAction; label: string };

/** An entry, as the menu needs it. `isRoot` is the workspace's own row. */
export interface TreeMenuEntry {
  path: string;
  basename: string;
  isFile: boolean;
  isRoot?: boolean;
}

/** The menu for `entry`: its groups in order, each closed by a separator except the last. */
export function treeMenuNodes(entry: TreeMenuEntry): TreeMenuNode[] {
  const item = (id: TreeMenuAction, label: string): TreeMenuNode => ({ kind: 'item', id, label });
  const groups: TreeMenuNode[][] = [];

  if (!entry.isRoot) {
    groups.push([item('rename', 'Rename'), item('delete', 'Delete')]);
  }
  if (!entry.isFile) {
    groups.push([item('new-file', 'New file'), item('new-folder', 'New folder')]);
  }
  groups.push([item('reveal', 'Reveal in folder')]);

  const copies: TreeMenuNode[] = [item('copy-path', 'Copy path'), item('copy-name', 'Copy name')];
  if (entry.isFile) {
    copies.push(item('copy-id', 'Copy id'));
  }
  groups.push(copies);

  const nodes: TreeMenuNode[] = [];
  groups.forEach((group, index) => {
    if (index > 0) {
      nodes.push({ kind: 'separator' });
    }
    nodes.push(...group);
  });
  return nodes;
}

/** The actions of a menu, in order — what the check and the popup both read. */
export function treeMenuActions(entry: TreeMenuEntry): TreeMenuAction[] {
  return treeMenuNodes(entry)
    .filter((node): node is Extract<TreeMenuNode, { kind: 'item' }> => node.kind === 'item')
    .map((node) => node.id);
}
