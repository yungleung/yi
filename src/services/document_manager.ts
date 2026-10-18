/**
 * Resolving a wikilink target to a file in the workspace, and reading the title a target is shown
 * under.
 *
 * May import: the file seam, the config, the id and title rules, and the workspace's news. Upholds:
 * one index of the workspace's documents — by file name and by frontmatter id — so every wikilink
 * to one target resolves to one file.
 */

/**
 * Document manager: resolves wikilink targets to files inside the current
 * workspace and reads their heading 1 for rendering.
 *
 * A target can be the markdown file's name (without the `.md` extension) or
 * the big numeric `id` stored in the file's YAML frontmatter. The name index
 * is built from directory listings; frontmatter ids are read lazily only when
 * an id-style target is actually requested.
 */
import { readTextFile } from '@tauri-apps/plugin-fs';
import { listFolderFiles, type FileInfo } from '../api/files';
import { configManager } from './config_manager';
import {
  firstHeading,
  readFrontmatterFields,
  readFrontmatterId,
  readFrontmatterTitle
} from './document_identity';
import { eventManager } from './event_manager';
import { WORKSPACE_CHANGED } from './workspace';

const MARKDOWN_EXTENSION = '.md';

let idIndex: Map<string, string> | null = null;
let titleCache = new Map<string, string | null>();
let buildPromise: Promise<Map<string, string>> | null = null;

export class DocumentManager {
  /** Every document of the workspace, cached until the workspace changes. */
  private catalogue: { target: string; title: string }[] | null = null;
  private catalogueWork: Promise<{ target: string; title: string }[]> | null = null;

  constructor() {
    // Rebuild the document index whenever the workspace changes.
    void eventManager.on(WORKSPACE_CHANGED, () => this.invalidate());
  }

  /**
   * The workspace's files are not what they were: a note was made, renamed, moved, deleted or
   * saved. Nothing is rebuilt now — every index is lazy — the next question about a document
   * reads the disk again.
   */
  invalidate(): void {
    idIndex = null;
    buildPromise = null;
    titleCache.clear();
    this.catalogue = null;
    this.catalogueWork = null;
  }

  /**
   * Every markdown file the workspace holds, as what a wikilink writes and what it shows: the
   * **target** `documentManager.resolve` takes — the frontmatter `id` when the file has one, and
   * the file's own name when it has none, which is the resolver's own first fallback — and the
   * title, the frontmatter's or the heading 1's, which is what a resolved wikilink draws.
   *
   * The target is not always an id, and that is the point: a wikilink written by the list has to
   * be one the resolver reads back, and a note with no id is reached by its file name rather than
   * by the title it happens to show.
   *
   * Reading a vault is many files, so this answers once and keeps the answer: the completion list
   * can be asked on every keystroke, and only a workspace change makes the files be read again.
   */
  async documents(): Promise<{ target: string; title: string }[]> {
    if (this.catalogue) {
      return this.catalogue;
    }
    this.catalogueWork ??= this.readCatalogue();
    const catalogue = await this.catalogueWork;
    this.catalogueWork = null;
    this.catalogue = catalogue;
    return catalogue;
  }

  private async readCatalogue(): Promise<{ target: string; title: string }[]> {
    const workspace = configManager.get()?.workspace;
    if (!workspace) {
      return [];
    }
    const names = await this.buildNameIndex();
    const documents: { target: string; title: string }[] = [];
    for (const [name, path] of names) {
      let content = '';
      try {
        content = await readTextFile(path);
      } catch {
        continue;
      }
      const fields = readFrontmatterFields(content);
      documents.push({
        target: fields.id ?? name,
        title: fields.title ?? firstHeading(content) ?? name
      });
    }
    return documents;
  }

  /** Resolves a wikilink target (markdown basename or frontmatter id) to a file path. */
  async resolve(target: string): Promise<string | null> {
    const name = target.trim();
    if (!name) {
      return null;
    }
    const names = await this.buildNameIndex();
    const byName = names.get(name);
    if (byName) {
      return byName;
    }
    return (await this.buildIdIndex()).get(name) ?? null;
  }

  /**
   * Returns the display title of the target document: the frontmatter `title`
   * key, falling back to its heading 1. Null when neither exists.
   */
  async getTitle(target: string): Promise<string | null> {
    const path = await this.resolve(target);
    if (!path) {
      return null;
    }
    const cached = titleCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const title = await readTitle(path);
    titleCache.set(path, title);
    return title;
  }

  private buildNameIndex(): Promise<Map<string, string>> {
    if (!buildPromise) {
      buildPromise = this.doBuildNameIndex();
    }
    return buildPromise;
  }

  private async doBuildNameIndex(): Promise<Map<string, string>> {
    const workspace = configManager.get()?.workspace;
    const index = new Map<string, string>();
    if (workspace) {
      await this.walk(workspace, index);
    }
    return index;
  }

  private async walk(dir: string, index: Map<string, string>): Promise<void> {
    let entries: FileInfo[];
    try {
      entries = await listFolderFiles(dir);
    } catch (error) {
      console.error('Failed to list workspace entries:', error);
      return;
    }
    for (const entry of entries) {
      if (entry.is_file) {
        if (entry.basename.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
          index.set(entry.basename.slice(0, -MARKDOWN_EXTENSION.length), entry.path);
        }
      } else {
        await this.walk(entry.path, index);
      }
    }
  }

  private async buildIdIndex(): Promise<Map<string, string>> {
    if (idIndex) {
      return idIndex;
    }
    const names = await this.buildNameIndex();
    const index = new Map<string, string>();
    for (const path of names.values()) {
      const id = await readDocumentId(path);
      if (id) {
        index.set(id, path);
      }
    }
    idIndex = index;
    return index;
  }
}

/** The app-wide document manager singleton. */
export const documentManager = new DocumentManager();

/**
 * The `id` a document's frontmatter gives it, or null when it has none.
 *
 * Exported beside the manager because the tree's "copy id" wants the same answer the
 * wikilink resolver's id index is built from: one reader, not two.
 */
export async function readDocumentId(path: string): Promise<string | null> {
  try {
    const content = await readTextFile(path);
    return readFrontmatterId(content);
  } catch {
    return null;
  }
}

async function readTitle(path: string): Promise<string | null> {
  try {
    const content = await readTextFile(path);
    const frontmatterTitle = readFrontmatterTitle(content);
    if (frontmatterTitle) {
      return frontmatterTitle;
    }
    return firstHeading(content);
  } catch {
    return null;
  }
}
