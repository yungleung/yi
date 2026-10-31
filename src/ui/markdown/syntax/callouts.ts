/**
 * The public callout facade: one stable import path over the model, readers,
 * parser preparation and kind-edit rule.
 *
 * Example: callers keep using `readCallout(text)` or importing
 * `CalloutSource`; the implementation behind them can change without moving
 * every editing, rendering and export consumer.
 *
 * May import: the callout model, reader, parser-source adapter and kind-edit
 * builder. Upholds: this facade exposes only the existing callout contract.
 */

export type {
  BuiltinCalloutKind,
  CalloutSource
} from './callout_model';
export {
  calloutAtOffset,
  calloutBodyInsertion,
  calloutHasBody,
  readCallout
} from './callout_reader';
export {
  calloutsForParsers,
  hasGenericFencedDiv
} from './callout_parser_source';
export { calloutKindEdit } from './callout_kind_edit';
