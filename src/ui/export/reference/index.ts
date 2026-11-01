/**
 * The export reference-header and native-bibliography domain.
 *
 * Example: LaTeX exports generate labels through `referenceHeader`, and native-BibTeX packages
 * filter their bibliography through the citation helpers.
 *
 * May import: the reference-header and native-bibliography siblings. Upholds: generated references
 * have one public surface.
 */

export { referenceHeader } from './header';
export {
  citedKeys,
  nativeBibliographyTarget,
  packageCitedBibliography
} from './native_bibliography';
