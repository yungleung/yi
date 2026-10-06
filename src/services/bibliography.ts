/**
 * The bibliography: loads the configured file, formats citations, and keeps the file watched for
 * edits something else made (Zotero rewriting the library).
 *
 * May import: the bibliography and config seams, the citation parser, and the events that say when
 * either changed. Upholds: one loaded library for the window, and one answer to "how does this
 * citation read", so every rendering of a citation agrees.
 */

/**
 * Bibliography manager: loads the configured bibliography file, formats
 * citations, and keeps the file watched for external edits (e.g. Zotero
 * rewriting the library). It listens for citation-config changes, reloads the
 * file, and announces {@link CITATION_UPDATED} so consumers (the editor) can
 * re-render.
 */
import { BaseDirectory, watch } from '@tauri-apps/plugin-fs';
import { Cite, type CiteInstance } from '@citation-js/core';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-bibtex';
import { readBibliography } from '../api/bibliography';
import { parseCitation, type CitationItem } from '../citations/parse';
import { CITATION_CONFIG_CHANGED, configManager } from './config_manager';
import { eventManager } from './event_manager';

/** Emitted after the bibliography is (re)loaded, so consumers can re-render. */
export const CITATION_UPDATED = 'citation_updated';

let bibliography: CiteInstance | null = null;
let loadPromise: Promise<boolean> | null = null;
let unwatch: (() => void) | null = null;

const formatCache = new Map<string, string>();

export class BibliographyManager {
  constructor() {
    // Reload whenever the citation config (file or style) changes.
    void eventManager.on(CITATION_CONFIG_CHANGED, () => {
      void this.handleConfigChanged();
    });
  }

  /**
   * The citation config changed elsewhere (e.g. the settings window): refresh
   * the in-memory config first so the file path and CSL style are current,
   * then reload the bibliography.
   */
  private async handleConfigChanged(): Promise<void> {
    try {
      await configManager.load();
    } catch (error) {
      console.error('Failed to reload the app config:', error);
    }
    await this.reload();
  }

  /** Loads the configured bibliography file (once). Resolves true when data is available. */
  async load(): Promise<boolean> {
    if (!loadPromise) {
      loadPromise = this.doLoad();
    }
    return loadPromise;
  }

  /** Forces a reload (the file may have changed on disk or in the config). */
  async reload(): Promise<boolean> {
    loadPromise = null;
    return this.load();
  }

  private async doLoad(): Promise<boolean> {
    try {
      const content = await readBibliography();
      bibliography = buildCite(content);
      // Previous renders may have cached raw fallbacks; formatting data changed.
      formatCache.clear();
      await this.startWatcher();
      await eventManager.emit(CITATION_UPDATED);
      return bibliography !== null;
    } catch (error) {
      console.error('Failed to load the bibliography file:', error);
      bibliography = null;
      formatCache.clear();
      await eventManager.emit(CITATION_UPDATED);
      return false;
    }
  }

  /**
   * Watches the configured bibliography file, reloading it (and announcing
   * CITATION_UPDATED) whenever it changes on disk. Replaces any previous watch.
   */
  async startWatcher(): Promise<void> {
    await this.stopWatcher();
    try {
      const configured = configManager.get()?.bibliography_file;
      if (!configured) {
        return;
      }
      const tildePath = configured.startsWith('~/');
      unwatch = await watch(
        tildePath ? configured.slice(2) : configured,
        () => {
          void this.reload();
        },
        tildePath ? { baseDir: BaseDirectory.Home, delayMs: 500 } : { delayMs: 500 }
      );
    } catch (error) {
      console.error('Failed to watch the bibliography file:', error);
    }
  }

  /** Stops watching the bibliography file, if a watcher is active. */
  async stopWatcher(): Promise<void> {
    unwatch?.();
    unwatch = null;
  }

  /** Formats a citation node's raw source (`@key` or `[@key, p. 45]`). */
  /**
   * Every entry the bibliography holds, as the key a citation writes and the title it shows —
   * which is what the completion list offers (`ui/markdown/syntax/completions.ts` filters it).
   * It is the same parsed data the formatting above reads, so a key the list offers is a key a
   * citation can be made of, and a title it shows is the title that citation will show.
   */
  entries(): { key: string; title: string }[] {
    if (!bibliography) {
      return [];
    }
    const data = bibliography.data as { id?: unknown; title?: unknown }[];
    return data
      .map((item) => ({
        key: String(item.id ?? ''),
        title: String(item.title ?? item.id ?? '')
      }))
      .filter((entry) => entry.key !== '');
  }

  format(value: string): string {
    const cached = formatCache.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const formatted = this.formatUncached(value);
    formatCache.set(value, formatted);
    return formatted;
  }

  /**
   * Returns the already-formatted text for a citation value, or null when it
   * has not been formatted yet. Renderers can show the raw source immediately
   * and only pay the (expensive, cold) CSL formatting cost once, in the
   * background.
   */
  formatCached(value: string): string | null {
    return formatCache.get(value) ?? null;
  }

  private formatUncached(value: string): string {
    if (!bibliography) {
      // Bibliography not loaded (yet): leave the raw source as-is.
      return value;
    }
    const parsed = parseCitation(value);
    if (parsed.items.length === 0) {
      return value;
    }
    try {
      if (parsed.mode === 'parenthetical') {
        return bibliography.format('citation', {
          entry: parsed.items.map(toCitationEntry),
          style: this.configuredStyle()
        });
      }

      const item = parsed.items[0];
      if (item.suppressAuthor) {
        // `-@key` renders as a plain parenthetical year: (2020).
        return bibliography.format('citation', {
          entry: [toCitationEntry(item)],
          style: this.configuredStyle()
        });
      }

      // Narrative: "Smith (2020)" — the author comes from an author-only
      // rendering and the "(year, locator)" part from the full cluster.
      const authorOnly = bibliography.format('citation', {
        entry: [{ ...toCitationEntry(item), 'author-only': true }],
        style: this.configuredStyle()
      });
      const full = bibliography.format('citation', {
        entry: [toCitationEntry(item)],
        style: this.configuredStyle()
      });
      return joinNarrative(authorOnly, full);
    } catch {
      // Unknown key: leave the raw source visible and editable.
      return value;
    }
  }

  /** The CSL style from the config manager, defaulting to APA. */
  private configuredStyle(): string {
    return configManager.get()?.csl_style || 'apa';
  }
}

/** The app-wide bibliography manager singleton. */
export const bibliographyManager = new BibliographyManager();

function buildCite(content: string): CiteInstance | null {
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('[')) {
      // CSL-JSON export (Zotero): use `citation-key` as the lookup id.
      const items = (JSON.parse(trimmed) as Array<Record<string, unknown>>).map(
        (item) => ({
          ...item,
          id: item['citation-key'] ?? item.id
        })
      );
      return new Cite(items);
    }
    // BibTeX (or another format citation-js understands).
    return new Cite(trimmed);
  } catch {
    return null;
  }
}

function joinNarrative(authorOnly: string, full: string): string {
  if (!full.startsWith('(') || !full.endsWith(')')) {
    return full;
  }
  const inner = full.slice(1, -1);
  if (inner.startsWith(`${authorOnly}, `)) {
    return `${authorOnly} (${inner.slice(authorOnly.length + 2)})`;
  }
  return full;
}

function toCitationEntry(item: CitationItem): Record<string, unknown> {
  return {
    id: item.id,
    ...(item.prefix !== undefined && { prefix: item.prefix }),
    ...(item.suffix !== undefined && { suffix: item.suffix }),
    ...(item.locator !== undefined && { locator: item.locator }),
    ...(item.label !== undefined && { label: item.label }),
    ...(item.suppressAuthor === true && { 'suppress-author': true })
  };
}
