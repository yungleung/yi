/**
 * The equation syntax domain.
 *
 * Example: consumers read a `[$$…$$]{#eq:x}` wrapper through this entrypoint, while the parser uses
 * the same entrypoint to prepare offset-preserving remark input.
 *
 * May import: the domain's focused block and masking modules. Upholds: equation syntax has one
 * explicit public surface and consumers do not reach into its sibling files.
 */

export {
  closesEquation,
  innerEquationBody,
  isEquationOpening,
  latexEquationBody,
  readDisplayMath,
  readEquationBlock,
  readEquationBlockSource,
  readEquationBody,
  unnumberedEquationBody
} from './blocks';
export type {
  DisplayMathSource,
  EquationBlockSource,
  EquationBody,
  EquationEnvironmentName
} from './blocks';
export { equationsForParsers } from './masking';
