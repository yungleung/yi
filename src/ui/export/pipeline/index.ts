/**
 * The shared export source-rewrite pipeline.
 *
 * Example: every export kind passes through `exportSource`, which applies citations, images,
 * figures, tables, equations, callouts and listings in the same ordered pipeline.
 *
 * May import: the pipeline stages. Upholds: one cross-kind pre-process and its public types.
 */

export { exportSource, TheoremCitationCollision } from './preprocess';
export type {
  CitationRendering,
  ExportAnswers,
  FileExists,
  Rewrite,
  TitleLookup
} from './contracts';
