/**
 * The public theorem-syntax facade.
 *
 * Example: callers ask this domain for the vocabulary resolved from frontmatter
 * rather than rereading `amsthm` metadata in their own modules.
 *
 * May import: the theorem model and vocabulary reader. Upholds: one explicit
 * entrypoint for every theorem syntax consumer.
 */

export {
  BUILTIN_DECLARATIONS,
  DEFAULT_THEOREM_VOCABULARY,
  defaultTheoremTitle,
  readParentCounter,
  resolveVocabulary,
  theoremClassName,
  theoremDeclaration,
  validTheoremClass
} from './model';
export type {
  TheoremIssue,
  TheoremParentCounter,
  TheoremStyle,
  TheoremType,
  TheoremVocabulary
} from './model';
export { theoremVocabularyFromFrontmatter } from './vocabulary';
export { readTheorem, theoremFromOpening } from './reader';
export type { TheoremSource } from './reader';
export { theoremsForParsers } from './parser_source';
export { theoremKindEdit } from './kind_edit';
