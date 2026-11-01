/**
 * The bundled Documentation domain.
 *
 * Example: the Help command opens `openDocumentation`, while its text is selected by `language`
 * through `documentationText`.
 *
 * May import: the flow and text siblings. Upholds: one Documentation command and one language text
 * map.
 */

export { openDocumentation, registerDocumentationCommand } from './flow';
export { documentationText } from './text';
