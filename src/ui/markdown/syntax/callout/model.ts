/**
 * The callout value and the grammar facts shared by reading, editing and parser
 * preparation.
 *
 * Example: `kind: 'warning', builtin: true, title: 'Warning'` is the model
 * produced for a GitHub `[!WARNING]` alert; a custom Div instead carries
 * `builtin: false` and its humanized or explicit title.
 *
 * May import: nothing. Upholds: only the five built-in kinds are implicit, and
 * `callout-title`/`callout-body` remain structural classes rather than kinds.
 */

export type BuiltinCalloutKind =
  | 'note'
  | 'tip'
  | 'important'
  | 'warning'
  | 'caution';

export interface CalloutSource {
  form: 'alert' | 'div';
  kind: string;
  builtin: boolean;
  title: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
  bodyFrom: number;
  bodyTo: number;
  quoteDepth: number;
  quotePrefix: string;
  source: string;
}

export const BUILTIN_TITLES: Record<BuiltinCalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
};

export const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
export const CALLOUT_CLASS = /^callout-([a-z0-9][a-z0-9_-]*)$/;
export const RESERVED_CALLOUT_CLASSES = new Set(['title', 'body']);

/** `my-warning` becomes `My Warning`; an explicit Div title wins over this. */
export function humanizeKind(kind: string): string {
  return kind
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
