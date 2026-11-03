/**
 * The image insertion and URL-resolution domain.
 *
 * Example: the editor command inserts through `insertImage`, while rendered notes resolve relative
 * pictures through `imageSourceCandidates`.
 *
 * May import: the dialog, flow and URL siblings. Upholds: image UI and image path resolution keep
 * one public entrypoint.
 */

export { ImageDialog, imageDialog } from './dialog';
export type { ImageChooser, ImageRequest } from './dialog';
export { insertImage, registerImageCommand } from './flow';
export {
  imageBases,
  imageSourceCandidates,
  setDocumentFolder,
  setImageFolder
} from './urls';
