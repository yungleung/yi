/**
 * The shell's adapters around the self-contained Markdown editing domain.
 *
 * Example: the editor panel builds the Markdown host, registers the editor's
 * command API and installs native-menu command dispatch through this entrypoint.
 *
 * May import: the adapter modules in this domain. Upholds: Markdown imports no
 * shell service or command runtime, while the composition root has one explicit
 * integration surface.
 */

export {
  createEditorCommandPort,
  registerMarkdownCommands
} from './commands';
