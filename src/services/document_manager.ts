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
import { eventManager } from './event_manager';
import { WORKSPACE_CHANGED } from './workspace';

const MARKDOWN_EXTENSION = '.md';

let idIndex: Map<string, string> | null = null;
let titleCache = new Map<string, string | null>();
let buildPromise: Promise<Map<string, string>> | null = null;

export class DocumentManager {
  constructor() {
    // Rebuild the document index whenever the workspace changes.
    void eventManager.on(WORKSPACE_CHANGED, () => {
      idIndex = null;
      buildPromise = null;
      titleCache.clear();
    });
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
      const id = await readFrontmatterId(path);
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

async function readFrontmatterId(path: string): Promise<string | null> {
  try {
    const content = await readTextFile(path);
    const frontmatter = readFrontmatterBlock(content);
    if (!frontmatter) {
      return null;
    }
    const idMatch = frontmatter.match(/^\s*id:\s*(.+?)\s*$/m);
    if (!idMatch) {
      return null;
    }
    return idMatch[1].replace(/^["']|["']$/g, '').trim();
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
    // Skip the YAML frontmatter block when present.
    const body = content.startsWith('---')
      ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
      : content;
    const match = body.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function readFrontmatterBlock(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

function readFrontmatterTitle(content: string): string | null {
  const frontmatter = readFrontmatterBlock(content);
  if (!frontmatter) {
    return null;
  }
  const titleMatch = frontmatter.match(/^\s*title:\s*(.+?)\s*$/m);
  if (!titleMatch) {
    return null;
  }
  return titleMatch[1].replace(/^["']|["']$/g, '').trim();
}
