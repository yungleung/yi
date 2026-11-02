/**
 * Registers Markdown's editing operations in the app-wide command catalogue.
 *
 * Example: a toolbar, native menu and future MCP client all dispatch
 * `format:bold`; this adapter calls the same `MarkdownCommandApi.applyFormatting`
 * that the editor's keyboard chord ultimately reaches.
 *
 * May import: the command runtime, trigger mapping and Markdown's public command
 * API. Upholds: Markdown owns editing semantics, while the shell owns command names,
 * authority dispatch and native-menu transport.
 */

import { CommandExecutionError } from '../../commands/dispatch';
import {
  registerCommand,
  runCommand
} from '../../commands/runtime';
import { commandForKey } from '../../commands/triggers/keymap';
import type { MarkdownCommandApi } from '../markdown/command_api';
import { FORMATTING_STYLES } from '../markdown/format';
import { LIST_KINDS } from '../markdown/syntax/list';
import { TABLE_COMMANDS } from '../markdown/editing/table';
import type { EditorCommandPort } from '../markdown/host';

/** Resolves keyboard and list-step requests through the app-wide dispatcher. */
export function createEditorCommandPort(): EditorCommandPort {
  return {
    runShortcut(event) {
      const command = commandForKey(event);
      if (command === null) {
        return false;
      }
      event.preventDefault();
      return runCommand(command, null, 'keyboard');
    },
    runListStep(direction) {
      return runCommand(
        direction === 'indent' ? 'list:indent' : 'list:outdent',
        null,
        'keyboard'
      );
    }
  };
}

/**
 * Registers every command whose implementation lives in the Markdown editor.
 *
 * Example: `document:replaceRange` reads the live position first; a stale
 * revision returns `stale` before `replaceRange` can touch the text.
 */
export function registerMarkdownCommands(api: MarkdownCommandApi): void {
  registerCommand({
    id: 'history:undo',
    run: () => {
      api.undo();
      return null;
    }
  });
  registerCommand({
    id: 'history:redo',
    run: () => {
      api.redo();
      return null;
    }
  });
  registerCommand({
    id: 'edit:cut',
    run: () => {
      api.cut();
      return null;
    }
  });
  registerCommand({
    id: 'edit:selectAll',
    run: () => {
      api.selectAll();
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertFootnote',
    run: () => {
      api.insertFootnote();
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertLink',
    run: () => {
      api.insertLink();
      return null;
    }
  });
  registerCommand({
    id: 'edit:insertRule',
    run: () => {
      api.insertRule();
      return null;
    }
  });
  registerCommand({
    id: 'view:togglePage',
    run: () => {
      api.togglePageLayout();
      return null;
    }
  });
  registerCommand({
    id: 'find:open',
    run: () => {
      api.openFind(false);
      return null;
    }
  });
  registerCommand({
    id: 'find:replace',
    run: () => {
      api.openFind(true);
      return null;
    }
  });
  registerCommand({
    id: 'find:close',
    run: () => {
      api.closeFind();
      return null;
    }
  });

  for (const style of FORMATTING_STYLES) {
    registerCommand({
      id: `format:${style}`,
      run: () => {
        api.applyFormatting(style);
        return null;
      }
    });
  }
  for (const command of [...LIST_KINDS, 'indent', 'outdent'] as const) {
    registerCommand({
      id: `list:${command}`,
      available: () => api.listCommandAvailable(command),
      run: () => {
        api.applyListCommand(command);
        return null;
      }
    });
  }
  for (const command of TABLE_COMMANDS) {
    registerCommand({
      id: `table:${command}`,
      run: (target) => {
        api.applyTableCommand(command, target);
        return null;
      }
    });
  }
  registerCommand({
    id: 'table:insert',
    run: (size) => {
      api.insertTable(size);
      return null;
    }
  });
  registerCommand({
    id: 'document:getRevision',
    run: () => api.documentPosition()
  });
  registerCommand({
    id: 'document:replaceRange',
    run: (input) => {
      const current = api.documentPosition();
      if (
        input.documentKey !== current.documentKey ||
        input.revision !== current.revision
      ) {
        throw new CommandExecutionError(
          'stale',
          `document moved to ${current.documentKey}@${current.revision}`
        );
      }
      if (input.to > api.documentLength()) {
        throw new CommandExecutionError('invalid-input', 'range is past the document end');
      }
      if (!api.replaceRange(input)) {
        throw new CommandExecutionError('forbidden', 'the document id is locked');
      }
      return api.documentPosition();
    }
  });
}
