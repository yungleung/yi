/**
 * The table and list caption syntax domain.
 *
 * Example: `captionLine` reads `: Results {#tbl:results}`; `restoreTableCaptions` and
 * `restoreListCaptions` reattach those lines after remark parses them separately.
 *
 * May import: the caption grammar and parser-repair siblings. Upholds: caption syntax and its
 * post-parse attachment share one explicit facade.
 */

export { captionLine } from './lines';
export type { CaptionLineData } from './lines';
export {
  restoreListCaptions,
  restoreTableCaptions
} from './repairs';
