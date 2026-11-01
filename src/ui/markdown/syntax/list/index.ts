/**
 * The Markdown list syntax domain.
 *
 * Example: `LIST_KINDS` names the three list commands, `listEdit` writes one kind onto a range,
 * and `listCaptionAfterList` attaches a following colon caption without involving code listings.
 *
 * May import: the domain's caption and edit modules. Upholds: one explicit list entrypoint while
 * shared caption-line grammar and code-listing syntax remain outside this domain.
 */

export {
  listCaptionAfterList,
  listCaptionLine,
  listCaptionsForParsers
} from './captions';
export type {
  ListCaptionAttachment,
  ListCaptionData,
  ListCaptionNode
} from './captions';
export {
  LIST_KINDS,
  indentEdit,
  listEdit,
  readMarker
} from './edits';
export type { ListKind } from './edits';
