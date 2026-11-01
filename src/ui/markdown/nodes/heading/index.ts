/**
 * The heading node domain.
 *
 * Example: the node registry builds `Heading`; the same facade exposes its marker and hover target
 * helpers for focused checks and internal rendering.
 *
 * May import: the heading node and its presentation helpers. Upholds: heading type, node component
 * and gutter chrome share one explicit entrypoint.
 */

export { Heading } from './node';
export { headingHoverTarget } from './hover';
export { headingMarker } from './marker';
export type { HeadingLevel } from './marker';
