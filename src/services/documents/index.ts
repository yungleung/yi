/**
 * The document identity and workspace catalogue domain.
 *
 * Example: `documentId` and `documentTitle` read one note's own identity, while `documentManager`
 * resolves workspace targets to files through the same rules.
 *
 * May import: the identity and manager siblings. Upholds: every document consumer uses one reader
 * for identity and one catalogue manager.
 */

export {
  documentId,
  documentTitle,
  fileStem,
  firstHeading,
  firstIdDigits,
  frontmatterEnd,
  idLineRange,
  readFrontmatterBlock,
  readFrontmatterFields,
  readFrontmatterId,
  readFrontmatterLang,
  readFrontmatterTitle
} from '../../ui/markdown/document/identity';
export type { FrontmatterFields } from '../../ui/markdown/document/identity';
export { DocumentManager, documentManager, readDocumentId } from './manager';
