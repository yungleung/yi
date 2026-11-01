/**
 * The new-note UI domain.
 *
 * Example: the composition root registers `file:newMarkdown` once through
 * `registerNewDocumentCommand`; the placement dialog and template picker stay implementation.
 *
 * May import: the new-note flow. Upholds: the shell sees one registration entrypoint.
 */

export { registerNewDocumentCommand } from './flow';
