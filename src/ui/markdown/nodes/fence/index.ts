/**
 * The fenced-block node view domain.
 *
 * Example: `FenceText` renders an editable body or complete source, `fenceLabel` draws its corner,
 * and `FencedDivSourceView` renders an unknown Div's exact source.
 *
 * May import: the domain's body/full-source, label and Div-source views. Upholds: fenced-container
 * rendering has one explicit entrypoint.
 */

export { fenceLabel } from './label';
export type { FenceLabelOptions } from './label';
export { FenceText } from './text';
export type { FenceTextStyle } from './text';
export { FencedDivSourceView } from './div_source';
