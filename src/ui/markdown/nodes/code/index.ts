/**
 * The fenced-code node domain.
 *
 * Example: the registry builds `CodeBlock`, whose body uses `highlightCode` with the fence's
 * language.
 *
 * May import: the code node and highlighter siblings. Upholds: code-node rendering and semantic
 * highlighting share one public entrypoint.
 */

export { CodeBlock } from './node';
export { highlightCode } from './highlight';
