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
import { plugins, type CiteInstance } from '@citation-js/core';
import { readBibliography } from '../api/bibliography';
import { parseCitation, type CitationItem } from '../citations/parse';
import { loadCitationLibrary } from '../citations/library';
import { referenceIds } from './citation_reference';
import { CITATION_CONFIG_CHANGED, configManager } from './config_manager';
import { eventManager } from './event_manager';

/** Emitted after the bibliography is (re)loaded, so consumers can re-render. */
export const CITATION_UPDATED = 'citation_updated';

let bibliography: CiteInstance | null = null;
let loadPromise: Promise<boolean> | null = null;
let unwatch: (() => void) | null = null;

const formatCache = new Map<string, string>();

/** The reference entries a citation was resolved to, keyed by the citation's own source. */
const referenceCache = new Map<string, string[]>();

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
      bibliography = loadCitationLibrary(content)?.cite ?? null;
      // Previous renders may have cached raw fallbacks; formatting data changed.
      formatCache.clear();
      referenceCache.clear();
      await this.startWatcher();
      await eventManager.emit(CITATION_UPDATED);
      return bibliography !== null;
    } catch (error) {
      console.error('Failed to load the bibliography file:', error);
      bibliography = null;
      formatCache.clear();
      referenceCache.clear();
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
   * The style the editor formats citations in, as pandoc needs it: the style's own name and its CSL
   * text. A style citation-js does not bundle answers null, and pandoc's own default style stands.
   *
   * It is the *same* name the formatting above reads (`configuredStyle`), which is the point: the
   * reference list an export appends is the style the page showed, not a second opinion about it.
   */
  cslForExport(): { name: string; xml: string } | null {
    const name = this.configuredStyle();
    const styles = (
      plugins.config.get('@csl') as { styles?: { get(name: string): unknown } } | undefined
    )?.styles;
    const xml = styles?.get(name);
    return typeof xml === 'string' ? { name, xml } : null;
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

  /**
   * The reference entries a citation's works are listed under in the configured style — one per
   * work the library holds, in the style's own order. Empty when there is nothing to show: no
   * bibliography loaded, or no key the library holds, which is a card that never appears
   * (`ui/markdown/citation_preview.ts`).
   */
  reference(value: string): string[] {
    const cached = referenceCache.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const entries = this.referenceUncached(value);
    referenceCache.set(value, entries);
    return entries;
  }

  private referenceUncached(value: string): string[] {
    if (!bibliography) {
      return [];
    }
    const ids = referenceIds(value, (id) => this.holds(id));
    if (ids.length === 0) {
      return [];
    }
    try {
      // The same style and library the in-text formatting reads, so a key's reference and its
      // citation in the sentence are two views of one answer.
      return bibliography
        .format('bibliography', { entry: ids, style: this.configuredStyle() })
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    } catch {
      return [];
    }
  }

  /**
   * The same entries for *all* the works a list of citations names — one per work, in the style's own
   * order — which is the reference list an export appends when the app is the one doing the
   * conversion (`ui/export/preprocess.ts`), rather than pandoc's citeproc.
   *
   * The entries are text, not the card's markup: what they are written into is markdown. A work cited
   * by two different citations is one entry.
   */
  referenceList(values: string[]): string[] {
    if (!bibliography) {
      return [];
    }
    const ids: string[] = [];
    for (const value of values) {
      for (const id of referenceIds(value, (candidate) => this.holds(candidate))) {
        if (!ids.includes(id)) {
          ids.push(id);
        }
      }
    }
    if (ids.length === 0) {
      return [];
    }
    try {
      return bibliography
        .format('bibliography', { entry: ids, style: this.configuredStyle() })
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    } catch {
      return [];
    }
  }

  /** Whether the loaded library holds `id` — read off the same data `entries()` offers. */
  private holds(id: string): boolean {
    return this.entries().some((entry) => entry.key === id);
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
