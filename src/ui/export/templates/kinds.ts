/**
 * The export kinds a template package can target.
 *
 * Example: a PDF package appears in `TEMPLATE_KINDS`, while a Markdown package does not because
 * Markdown has no external template package.
 *
 * May import: nothing. Upholds: the package chooser offers one ordered template-kind vocabulary.
 */

export const TEMPLATE_KINDS = ['latex', 'pdf', 'html', 'epub', 'docx', 'odt'] as const;
