/**
 * The export reference-header and native-bibliography domain.
 *
 * Example: LaTeX exports generate target labels through `referenceHeader`, theorem environments
 * through `theoremHeader`, and native-BibTeX packages filter their bibliography through the
 * citation helpers.
 *
 * May import: the reference-header and native-bibliography siblings. Upholds: generated references
 * have one public surface.
 */

export { referenceHeader } from './header';
export { theoremHeader } from './theorem_header';
export {
  citedKeys,
  nativeBibliographyTarget,
  packageCitedBibliography
} from './native_bibliography';
