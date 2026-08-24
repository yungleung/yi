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
    format(format: 'citation' | 'bibliography', options?: CiteFormatOptions): string;
  }

  interface CiteConstructor {
    new (input: string | unknown[]): CiteInstance;
  }

  export const Cite: CiteConstructor;
}

/* Side-effect imports: loading the plugins registers their formats/styles on
 * @citation-js/core. The packages ship no type declarations, so ambient
 * declarations satisfy the module resolver for these imports. */
declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-csl';
