/**
 * The two pure rules the workspace tree is built on: what part of a file's name a rename
 * starts with selected, and whether one entry may be dropped into a folder.
 *
 * Both are about an entry as the tree knows it — its path, its name, whether it is a
 * file — and neither touches the DOM, so both are checked in Node
 * (`test/checks/check-tree-rules.mjs`). The filesystem's own rules (what a name may be,
 * what already exists) are the backend's, in `src-tauri/src/files.rs`: this module never
 * decides those, it only decides what the *interaction* should do.
 *
 * May import: nothing — the entries are passed in. Upholds: one fact about the workspace
 * tree has one home, and this is the home of these two rules.
 */

/** The markdown extensions a tree file can have; the backend lists the same ones. */
const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx'];

/** An entry, as the tree and its rules see it. */
export interface TreeEntry {
  /** The entry's absolute path. */
  path: string;
  /** Its name, extension and all. */
  basename: string;
  /** Whether it is a file (a folder otherwise). */
  isFile: boolean;
}

/**
 * What a rename selects when the edit opens: the name, without the file's markdown
 * extension.
 *
 * The point is that the author can type a new name straight away — the extension they
 * did not mean to touch stays where it is — while the characters they *can* see stay the
 * whole name, so the selection is over text that is really there.
 */
export function nameSelection(basename: string, isFile: boolean): { start: number; end: number } {
  return { start: 0, end: nameWithoutExtension(basename, isFile).length };
}

/**
 * The name a reader means by "the file's name": the basename without its markdown
 * extension (`note.md` → `note`, `a.b.md` → `a.b`), and a folder's name as it is.
 *
 * One home for it, because the rename selects it and Copy name copies it.
 */
export function nameWithoutExtension(basename: string, isFile: boolean): string {
  if (!isFile) {
    return basename;
  }
  const dot = basename.lastIndexOf('.');
  if (dot <= 0) {
    return basename;
  }
  const extension = basename.slice(dot + 1).toLowerCase();
  return MARKDOWN_EXTENSIONS.includes(extension) ? basename.slice(0, dot) : basename;
}

/** Why a drop is or is not allowed, for the hint the pointer shows. */
export type DropDecision =
  | { allowed: true }
  | { allowed: false; reason: 'not-a-folder' | 'itself' | 'inside-itself' | 'already-there' };

/**
 * Whether `dragged` may be dropped into the folder `target`.
 *
 * A file is not a place to put anything; an entry cannot be dropped onto itself, nor
 * into a folder inside itself (that would take it off the tree with its children); and a
 * drop into the folder the entry already lives in is not a move, so the tree shows no
 * target for it rather than pretending something happened.
 */
export function dropDecision(dragged: TreeEntry, target: TreeEntry): DropDecision {
  if (target.isFile) {
    return { allowed: false, reason: 'not-a-folder' };
  }
  if (target.path === dragged.path) {
    return { allowed: false, reason: 'itself' };
  }
  const targetPath = target.path.replace(/\\/g, '/');
  const draggedPath = dragged.path.replace(/\\/g, '/');
  if (targetPath.startsWith(`${draggedPath}/`)) {
    return { allowed: false, reason: 'inside-itself' };
  }
  const cut = Math.max(dragged.path.lastIndexOf('/'), dragged.path.lastIndexOf('\\'));
  const parent = cut > 0 ? dragged.path.slice(0, cut) : null;
  if (parent === target.path) {
    return { allowed: false, reason: 'already-there' };
  }
  return { allowed: true };
}
