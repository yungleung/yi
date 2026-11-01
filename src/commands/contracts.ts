/**
 * The one catalogue of app commands: id, input type, effect, timing, exposure and parser.
 *
 * Example: the native menu sends no folder for `file:newMarkdown`, while the
 * workspace tree sends `{ folder: '/notes/history' }`. Both become one typed
 * input here before the new-note flow runs.
 *
 * May import: command vocabulary constants and their types. Upholds: every external
 * command payload is parsed before feature code sees it.
 */

import { FORMATTING_STYLES, type FormattingStyle } from '../ui/markdown/format';
import { LIST_KINDS } from '../ui/markdown/syntax/list';
import { TABLE_COMMANDS, type TableCommand } from '../ui/markdown/syntax/table';
import type { TableTarget } from '../ui/markdown/editing/table';

/** What a command may change when it runs. */
export type CommandEffect =
  | 'none'
  | 'document.write'
  | 'session.write'
  | 'workspace.write'
  | 'export.run'
  | 'version.write';

/**
 * One command's declaration.
 *
 * Example: `CommandContract<string>` describes a command whose parser must
 * turn external input into one string before its implementation can run.
 */
export interface CommandContract<Input, Output = null> {
  /** Phantom type only; command input is parsed at dispatch time. */
  readonly __input?: Input;
  /** Phantom type only; command output is reported in the dispatch result. */
  readonly __output?: Output;
  readonly effect: CommandEffect;
  readonly timing: 'sync' | 'async';
  readonly exposure: 'public' | 'internal';
  readonly description: string;
  readonly parse: (value: unknown) => Input;
}

/** A malformed value crossed a command boundary. */
export class CommandInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandInputError';
  }
}

/** A new note may be given a folder by the trigger that already knows it. */
export interface NewDocumentCommandInput {
  readonly folder: string;
}

/** The positive dimensions the table picker hands to `table:insert`. */
export interface TableSizeInput {
  readonly rows: number;
  readonly columns: number;
}

/** The identity and revision an agent plans a document edit against. */
export interface DocumentPosition {
  readonly documentKey: string;
  readonly revision: number;
}

/** One revision-checked raw-text replacement. */
export interface ReplaceRangeInput extends DocumentPosition {
  readonly from: number;
  readonly to: number;
  readonly replacement: string;
}

type NoInputContract = CommandContract<null>;
type FormattingContracts = {
  [Id in `format:${FormattingStyle}`]: NoInputContract;
};
type ListContracts = {
  [Id in `list:${(typeof LIST_KINDS)[number] | 'indent' | 'outdent'}`]: NoInputContract;
};
type TableContracts = {
  [Id in `table:${TableCommand}`]: CommandContract<TableTarget>;
};

/** Every app command and the input/output contract it exposes. */
export type CommandContracts = FormattingContracts &
  ListContracts &
  TableContracts & {
    'history:undo': NoInputContract;
    'history:redo': NoInputContract;
    'edit:cut': NoInputContract;
    'edit:selectAll': NoInputContract;
    'edit:insertFootnote': NoInputContract;
    'edit:insertLink': NoInputContract;
    'edit:insertRule': NoInputContract;
    'edit:insertImage': NoInputContract;
    'file:save': CommandContract<null>;
    'file:saveAs': CommandContract<null>;
    'file:export': CommandContract<string | null>;
    'export:manageTemplates': NoInputContract;
    'file:newMarkdown': CommandContract<NewDocumentCommandInput | null>;
    'help:tutorial': NoInputContract;
    'help:documentation': NoInputContract;
    'version:save': NoInputContract;
    'session:toggleStack': NoInputContract;
    'session:nextStacked': NoInputContract;
    'session:previousStacked': NoInputContract;
    'session:openStack': NoInputContract;
    'session:restore': CommandContract<string>;
    'session:drop': CommandContract<string>;
    'view:togglePage': NoInputContract;
    'find:open': NoInputContract;
    'find:replace': NoInputContract;
    'find:close': NoInputContract;
    'table:insert': CommandContract<TableSizeInput>;
    'document:getRevision': CommandContract<null, DocumentPosition>;
    'document:replaceRange': CommandContract<ReplaceRangeInput, DocumentPosition>;
  };

/** One command id from the catalogue. */
export type CommandId = keyof CommandContracts;

/** The parsed input a command accepts. */
export type CommandInput<Id extends CommandId> =
  CommandContracts[Id] extends CommandContract<infer Input, unknown> ? Input : never;

/** The value a command reports on success. */
export type CommandOutput<Id extends CommandId> =
  CommandContracts[Id] extends CommandContract<unknown, infer Output> ? Output : never;

/** Accepts an absent payload and nothing else. */
function parseNoInput(value: unknown): null {
  if (value === undefined || value === null) {
    return null;
  }
  throw new CommandInputError('this command takes no input');
}

/** Requires non-empty text. */
function parseRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CommandInputError(`${name} must be a non-empty string`);
  }
  return value;
}

/** Accepts an absent kind, otherwise requires non-empty text. */
function parseOptionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return parseRequiredString(value, name);
}

/**
 * Reads the tree's optional folder or the menu's absent payload.
 *
 * Example: `undefined` asks the dialog with no folder, while
 * `{ folder: '/notes/history' }` creates the note there directly.
 */
function parseNewDocumentInput(value: unknown): NewDocumentCommandInput | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandInputError('new note input must be an object or null');
  }
  const folder = (value as { folder?: unknown }).folder;
  if (folder === undefined) {
    return null;
  }
  return { folder: parseRequiredString(folder, 'folder') };
}

/** Requires a finite number, which prevents NaN and Infinity from reaching feature code. */
function parseFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CommandInputError(`${name} must be a finite number`);
  }
  return value;
}

/**
 * Reads the table target captured before a context menu took focus.
 *
 * Example: `{ lineStart: 12, row: 1, column: 0 }` means the first body cell
 * of the table beginning on line 12.
 */
function parseTableTarget(value: unknown): TableTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandInputError('table target must be an object');
  }
  const target = value as Record<string, unknown>;
  return {
    lineStart: parseFiniteNumber(target.lineStart, 'lineStart'),
    row: parseFiniteNumber(target.row, 'row'),
    column: parseFiniteNumber(target.column, 'column')
  };
}

/** Reads the positive dimensions the table picker hands over. */
function parseTableSize(value: unknown): TableSizeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandInputError('table size must be an object');
  }
  const size = value as Record<string, unknown>;
  const rows = parseFiniteNumber(size.rows, 'rows');
  const columns = parseFiniteNumber(size.columns, 'columns');
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(columns) || columns <= 0) {
    throw new CommandInputError('table rows and columns must be positive integers');
  }
  return { rows, columns };
}

/** Requires a non-negative integer. */
function parseNonNegativeInteger(value: unknown, name: string): number {
  const number = parseFiniteNumber(value, name);
  if (!Number.isInteger(number) || number < 0) {
    throw new CommandInputError(`${name} must be a non-negative integer`);
  }
  return number;
}

/**
 * Reads one revision-checked range replacement.
 *
 * Example: `{ documentKey: 'document-7', revision: 42, from: 6, to: 11,
 * replacement: 'Bob' }` is accepted; revision `1.5` or `from > to` is refused
 * before the editor sees it.
 */
function parseReplaceRangeInput(value: unknown): ReplaceRangeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommandInputError('range edit input must be an object');
  }
  const input = value as Record<string, unknown>;
  const from = parseNonNegativeInteger(input.from, 'from');
  const to = parseNonNegativeInteger(input.to, 'to');
  if (from > to) {
    throw new CommandInputError('from must not be past to');
  }
  if (typeof input.replacement !== 'string') {
    throw new CommandInputError('replacement must be a string');
  }
  return {
    documentKey: parseRequiredString(input.documentKey, 'documentKey'),
    revision: parseNonNegativeInteger(input.revision, 'revision'),
    from,
    to,
    replacement: input.replacement
  };
}

/** The common declaration for a command that takes no input. */
function noInput(description: string): NoInputContract {
  return {
    effect: 'none',
    timing: 'sync',
    exposure: 'public',
    description,
    parse: parseNoInput
  };
}

/** A command that changes the document and therefore observes read-only state. */
function documentWrite(description: string): NoInputContract {
  return { ...noInput(description), effect: 'document.write' };
}

const formatting = Object.fromEntries(
  FORMATTING_STYLES.map((style) => [
    `format:${style}`,
    documentWrite(`apply ${style} to the current selection`)
  ])
) as FormattingContracts;

const lists = Object.fromEntries(
  [...LIST_KINDS, 'indent', 'outdent'].map((command) => [
    `list:${command}`,
    documentWrite(`apply the ${command} list command`)
  ])
) as ListContracts;

const tables = Object.fromEntries(
  TABLE_COMMANDS.map((command) => [
    `table:${command}`,
    {
      ...documentWrite(`apply the ${command} table command`),
      parse: parseTableTarget
    }
  ])
) as TableContracts;

/** The runtime half of the command catalogue, keyed by the same ids as the types. */
export const commandContracts: CommandContracts = {
  ...formatting,
  ...lists,
  ...tables,
  'history:undo': documentWrite('undo the last document edit'),
  'history:redo': documentWrite('redo the last undone document edit'),
  'edit:cut': documentWrite('cut the current selection'),
  'edit:selectAll': noInput('select the whole document'),
  'edit:insertFootnote': documentWrite('insert a footnote'),
  'edit:insertLink': documentWrite('insert a link'),
  'edit:insertRule': documentWrite('insert a thematic rule'),
  'edit:insertImage': documentWrite('insert an image'),
  'file:save': {
    ...noInput('save the document on screen'),
    effect: 'workspace.write',
    timing: 'async'
  },
  'file:saveAs': {
    ...noInput('save the document under another path'),
    effect: 'workspace.write',
    timing: 'async'
  },
  'file:export': {
    effect: 'export.run',
    timing: 'async',
    exposure: 'public',
    description: 'export the document on screen',
    parse: (value) => parseOptionalString(value, 'export kind')
  },
  'export:manageTemplates': {
    ...noInput('open the export template manager'),
    timing: 'async'
  },
  'file:newMarkdown': {
    effect: 'workspace.write',
    timing: 'async',
    exposure: 'public',
    description: 'create and open a new markdown note',
    parse: parseNewDocumentInput
  },
  'help:tutorial': noInput('open the tutorial'),
  'help:documentation': noInput('open Documentation'),
  'version:save': {
    ...noInput('save a version of the document'),
    effect: 'version.write',
    timing: 'async'
  },
  'session:toggleStack': {
    ...noInput('toggle the current document in the stack'),
    effect: 'session.write'
  },
  'session:nextStacked': {
    ...noInput('open the next stacked document'),
    effect: 'session.write'
  },
  'session:previousStacked': {
    ...noInput('open the previous stacked document'),
    effect: 'session.write'
  },
  'session:openStack': noInput('open the stacked document list'),
  'session:restore': {
    effect: 'session.write',
    timing: 'sync',
    exposure: 'public',
    description: 'open a stacked document',
    parse: (value) => parseRequiredString(value, 'document id')
  },
  'session:drop': {
    effect: 'session.write',
    timing: 'async',
    exposure: 'public',
    description: 'drop a document from the stack',
    parse: (value) => parseRequiredString(value, 'document id')
  },
  'view:togglePage': noInput('switch between the page and full-width layout'),
  'find:open': noInput('open find'),
  'find:replace': noInput('open find and replace'),
  'find:close': noInput('close find'),
  'table:insert': {
    effect: 'document.write',
    timing: 'sync',
    exposure: 'public',
    description: 'insert a table',
    parse: parseTableSize
  },
  'document:getRevision': {
    effect: 'none',
    timing: 'sync',
    exposure: 'public',
    description: 'read the current document key and revision',
    parse: parseNoInput
  },
  'document:replaceRange': {
    effect: 'document.write',
    timing: 'sync',
    exposure: 'public',
    description: 'replace one document range against an expected revision',
    parse: parseReplaceRangeInput
  }
};

/**
 * Parses one external command payload through its declared contract.
 *
 * Example: `parseCommandInput('table:insert', { rows: 0, columns: 1 })`
 * throws instead of letting the table editor create an impossible table.
 */
export function parseCommandInput<Id extends CommandId>(
  id: Id,
  value: unknown
): CommandInput<Id> {
  return commandContracts[id].parse(value) as CommandInput<Id>;
}
