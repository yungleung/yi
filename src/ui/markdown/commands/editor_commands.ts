/**
 * The commands owned by the Markdown editor, registered by their app-wide ids.
 *
 * Example: `format:bold` calls the same `applyFormatting` used by the keyboard chord,
 * while `document:replaceRange` refuses a stale agent edit before it reaches `applyEdit`.
 *
 * May import: the command runtime, command failure contract, editing rules and editor
 * context. Upholds: one command id has one implementation and one dispatch path.
 */

import { CommandExecutionError } from '../../../commands/dispatch';
import { registerCommand } from '../../../commands/runtime';
import { cutSelection, selectAll } from '../editing/clipboard';
import { applyEdit, type EditorContext } from '../editing/context';
import { applyFormatting } from '../editing/formatting';
import { insertFootnote } from '../editing/footnotes';
import { insertLink } from '../editing/links';
import { LIST_COMMANDS, applyListCommand, listCommandEdit } from '../editing/lists';
import {
  TABLE_COMMANDS,
  insertTable,
  runTableCommand,
  type TableTarget
} from '../editing/table';
import { insertThematicBreak } from '../editing/thematic_break';
import { FORMATTING_STYLES } from '../format';

/** What command registration needs from the editor that owns the document. */
export interface CommandHost {
  readonly context: EditorContext;
  openFind(replace: boolean): void;
  closeFind(): void;
  applyHistory(direction: 'undo' | 'redo'): void;
  toggleLayout(): void;
}

/**
 * Registers every command whose behaviour belongs to the Markdown editor.
 *
 * Example: a toolbar button and Cmd/Ctrl+B both dispatch `format:bold`, so neither
 * can bypass the document's read-only authority or its one editing implementation.
 */
export function registerEditorCommands(host: CommandHost): void {
  const { context } = host;

  registerCommand({
    id: 'history:undo',
    run: () => {
      host.applyHistory('undo');
      return null;
    }
  });
  registerCommand({
    id: 'history:redo',
    run: () => {
      host.applyHistory('redo');
      return null;
    }
  });
  registerCommand({
    id: 'edit:cut',
    run: () => {
      cutSelection(context);
      return null;
    }
  });
  registerCommand({
    id: 'edit:selectAll',
    run: () => {
      selectAll(context);
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertFootnote',
    run: () => {
      insertFootnote(context);
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertLink',
    run: () => {
      void insertLink(context);
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertRule',
    run: () => {
      insertThematicBreak(context);
      return null;
    }
  });
  registerCommand({
    id: 'view:togglePage',
    run: () => {
      host.toggleLayout();
      return null;
    }
  });
  registerCommand({
    id: 'find:open',
    run: () => {
      host.openFind(false);
      return null;
    }
  });
  registerCommand({
    id: 'find:replace',
    run: () => {
      host.openFind(true);
      return null;
    }
  });
  registerCommand({
    id: 'find:close',
    run: () => {
      host.closeFind();
      return null;
    }
  });

  for (const style of FORMATTING_STYLES) {
    registerCommand({
      id: `format:${style}`,
      run: () => {
        applyFormatting(context, style);
        return null;
      }
    });
  }
  for (const command of LIST_COMMANDS) {
    registerCommand({
      id: `list:${command}`,
      available: () => listCommandEdit(context, command) !== null,
      run: () => {
        applyListCommand(context, command);
        return null;
      }
    });
  }
  for (const command of TABLE_COMMANDS) {
    registerCommand({
      id: `table:${command}`,
      run: (target: TableTarget) => {
        runTableCommand(context, target, command);
        return null;
      }
    });
  }
  registerCommand({
    id: 'table:insert',
    run: (size) => {
      insertTable(context, size);
      return null;
    }
  });
  registerCommand({
    id: 'document:getRevision',
    run: () => ({
      documentKey: context.state.getDocumentKey(),
      revision: context.state.getRevision()
    })
  });
  registerCommand({
    id: 'document:replaceRange',
    run: (input) => {
      const position = {
        documentKey: context.state.getDocumentKey(),
        revision: context.state.getRevision()
      };
      if (
        input.documentKey !== position.documentKey ||
        input.revision !== position.revision
      ) {
        throw new CommandExecutionError(
          'stale',
          `document moved to ${position.documentKey}@${position.revision}`
        );
      }
      if (input.to > context.state.getText().length) {
        throw new CommandExecutionError('invalid-input', 'range is past the document end');
      }
      if (!applyEdit(context, input.from, input.to, input.replacement)) {
        throw new CommandExecutionError('forbidden', 'the document id is locked');
      }
      return {
        documentKey: context.state.getDocumentKey(),
        revision: context.state.getRevision()
      };
    }
  });
}
