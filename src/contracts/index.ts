/**
 * The app's neutral cross-layer contracts.
 *
 * Example: the event service, session model and Markdown editor import the same
 * `EditorDocumentChanged` type from here instead of one of them owning it.
 *
 * May import: the contract modules it exposes. Upholds: consumers share vocabulary
 * without depending on one another's implementations.
 */

export type {
  EditorChangeReason,
  EditorDocumentChanged,
  EditorDocumentPosition,
  EditorDocumentView,
  EditorReplaceRange,
  EditorSeenView
} from './editor';
