/**
 * The types `@citation-js/core` does not ship: what a `Cite` instance the app builds can format.
 *
 * May import: nothing. Upholds: one declaration of the citation library's surface, so the formatter
 * (`services/bibliography/index.ts`) is typed against what it actually calls.
 */

declare module '@citation-js/core' {
  interface CiteFormatOptions {
    entry?: string | string[] | Array<Record<string, unknown>>;
    style?: string;
    template?: string;
    lang?: string;
    format?: 'text' | 'html' | 'rtf' | 'asciidoc' | 'fo' | 'latex';
  }

  export interface CiteInstance {
    data: unknown[];
    format(format: 'citation' | 'bibliography' | 'bibtex', options?: CiteFormatOptions): string;
  }

  interface CiteConstructor {
    new (input: string | unknown[]): CiteInstance;
  }

  export const Cite: CiteConstructor;

  /**
   * The library's plugin register, and the one thing the app asks it: the configuration a plugin
   * registered under its own name — `@csl` holds the CSL styles the formatter can use
   * (`services/bibliography/index.ts: cslForExport`).
   */
  export const plugins: {
    config: { get(name: string): unknown };
  };
}

/* Side-effect imports: loading the plugins registers their formats/styles on
 * @citation-js/core. The packages ship no type declarations, so ambient
 * declarations satisfy the module resolver for these imports. */
declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-csl';
