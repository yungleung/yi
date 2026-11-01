/**
 * The export asset portability domain.
 *
 * Example: LaTeX pictures become bundled note assets through `portableLatexImage`, while formats
 * that cannot carry vectors use the raster helpers.
 *
 * May import: LaTeX, raster and picture-diagnostic siblings. Upholds: copied or drawn export assets
 * share one public surface.
 */

export { portableLatexImage } from './latex_images';
export type { LatexImagePlan } from './latex_images';
export {
  forgetRasters,
  needsDrawing,
  rasterFolder,
  rasterPictures
} from './raster_picture';
export type { PictureLookup } from './raster_picture';
export {
  destinationsThatNameNoImage,
  imageDestinations,
  isWebDestination,
  namesNoImage
} from './picture_hint';
