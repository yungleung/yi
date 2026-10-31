/**
 * The commands this editor owns, registered by name.
 *
 * The editor wires the events and keeps the caret; what each command *does* is
 * a function under `editing/`, and this is the table that says which name
 * reaches which of them — filled once, in the one place
 * `src/commands/runtime.ts` expects to be filled from, so a chord, a toolbar
 * button, a menu item and the keymap all land on the same code.
 *
 * May import: the registry, the editing rules the commands apply and the
 * variables those rules are enumerated from. Upholds: one command has one name,
 * one home and one way in — a second registration for an id throws in the
 * registry rather than quietly winning.
 */

import { FORMATTING_STYLES } from '../format';
import { LIST_COMMANDS, applyListCommand, listCommandEdit } from '../editing/lists';
import {
  TABLE_COMMANDS,
  insertTable,
  runTableCommand,
  type TableCommand,
  type TableTarget
} from '../editing/table';
import type { EditorContext } from '../editing/context';
import { cutSelection, selectAll } from '../editing/clipboard';
import { applyFormatting } from '../editing/formatting';
import { insertFootnote } from '../editing/footnotes';
import { insertLink } from '../editing/links';
import { insertThematicBreak } from '../editing/thematic_break';
import { insertImage } from '../../image/image_flow';
import { registerCommand } from '../../../commands/runtime';

/** What a command needs from the editor that registers it. */
export interface CommandHost {
  /** The document, the renderer and the scroll container. */
  readonly context: EditorContext;
  /** Opens the find bar, on the query field or on the replace field. */
  openFind(replace: boolean): void;
  closeFind(): void;
  /** Undo or redo, keeping the caret at its document offset. */
  applyHistory(direction: 'undo' | 'redo'): void;
  /** Switches the editor between its page of A4 and a column the width of the pane. */
  toggleLayout(): void;
}

/** Registers every command the editor owns against the registry. */
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
    id: 'edit:insertImage',
    run: () => {
      void insertImage(context);
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
  // One command per inline style, per list command and per table operation,
  // enumerated from the modules that own those lists: a button or a menu item
  // can only name a command that is registered here.
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
    // A list command applies where there is a list line to move, and Tab has to
    // know that *before* it runs: a Tab that cannot indent here is the code
    // block's Tab, two spaces of text (`markdown_editor.ts`).
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
      run: (target) => {
        runTableOperation(context, command, target);
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
}

/**
 * Runs one table-menu operation on the cell the menu captured before it took
 * focus. The payload comes from a native menu, so it is checked, not trusted.
 */
function runTableOperation(context: EditorContext, command: TableCommand, target: TableTarget): void {
  runTableCommand(context, target, command);
}
