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
  private catalogue: { id: string; title: string }[] | null = null;
  private catalogueWork: Promise<{ id: string; title: string }[]> | null = null;

  constructor() {
    // Rebuild the document index whenever the workspace changes.
    void eventManager.on(WORKSPACE_CHANGED, () => {
      idIndex = null;
      buildPromise = null;
      titleCache.clear();
      this.catalogue = null;
      this.catalogueWork = null;
    });
  }

  /**
   * Every markdown file the workspace holds, as what a wikilink writes and what it shows: the
   * document's own `id` — the frontmatter's, which is what a wikilink by id resolves — and its
   * title, falling back to the file's own name when it has none (which is what the resolver falls
   * back to as well, so an `id`-less document is written under the name that reaches it).
   *
   * Reading a vault is many files, so this answers once and keeps the answer: the completion list
   * can be asked on every keystroke, and only a workspace change makes the files be read again.
   */
  async documents(): Promise<{ id: string; title: string }[]> {
    if (this.catalogue) {
      return this.catalogue;
    }
    this.catalogueWork ??= this.readCatalogue();
    const catalogue = await this.catalogueWork;
    this.catalogueWork = null;
    this.catalogue = catalogue;
    return catalogue;
  }

  private async readCatalogue(): Promise<{ id: string; title: string }[]> {
    const workspace = configManager.get()?.workspace;
    if (!workspace) {
      return [];
    }
    const names = await this.buildNameIndex();
    const documents: { id: string; title: string }[] = [];
    for (const [name, path] of names) {
      let content = '';
      try {
        content = await readTextFile(path);
      } catch {
        continue;
      }
      documents.push({
        id: readFrontmatterId(content) ?? name,
        title: readFrontmatterTitle(content) ?? firstHeading(content) ?? name
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
