/**
 * The block-renderer internals domain.
 *
 * Example: `VirtualBlockRenderer` composes block caching, DOM creation, height measurement and
 * scroll/spacer geometry from this entrypoint.
 *
 * May import: the renderer siblings. Upholds: mounted DOM, cached elements and geometry share one
 * renderer-facing surface.
 */

export { RendererBlockCache } from './block_cache';
export { RendererDom } from './dom';
export type { RendererDomDependencies } from './dom';
export { RendererGeometry } from './geometry';
export type {
  MountedRange,
  RendererGeometryDependencies,
  ScrollAnchor
} from './geometry';
export { RendererMeasurements } from './measurements';
export type { RendererMeasurementDependencies } from './measurements';
