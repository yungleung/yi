/**
 * The words an export kind is offered under, in one place for the card and the template library.
 *
 * May import: the catalogue. Upholds: one reading of the kind names, so a kind added to Rust's
 * table gets the same label in the export card and in the package chooser.
 */

import { t } from '../../../services/i18n';

export function kindLabel(kind: string): string {
  switch (kind) {
    case 'docx':
      return t('export.kind.docx');
    case 'odt':
      return t('export.kind.odt');
    case 'latex':
      return t('export.kind.latex');
    case 'html':
      return t('export.kind.html');
    case 'revealjs':
      return t('export.kind.revealjs');
    case 'epub':
      return t('export.kind.epub');
    case 'pdf':
      return t('export.kind.pdf');
    case 'beamer':
      return t('export.kind.beamer');
    case 'markdown':
      return t('export.kind.markdown');
    default:
      return kind;
  }
}

/** The kinds a package can be for, in the order the chooser offers them. */
export const TEMPLATE_KINDS = ['latex', 'pdf', 'html', 'epub', 'docx', 'odt'] as const;
