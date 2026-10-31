/**
 * Checks the command catalogue as data: every id has one contract, each
 * parser accepts its real trigger shape, and malformed external input is refused.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-command-contracts-'));
const build = await rolldown({ input: 'src/commands/contracts.ts', logLevel: 'silent' });
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'contracts.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const {
  commandContracts,
  parseCommandInput,
  CommandInputError
} = await import(file);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const rejects = (name, id, value) => {
  let thrown = null;
  try {
    parseCommandInput(id, value);
  } catch (error) {
    thrown = error;
  }
  check(name, thrown instanceof CommandInputError, true);
};

check(
  'the table includes every current command family',
  [
    'format:bold' in commandContracts,
    'list:indent' in commandContracts,
    'table:insert' in commandContracts,
    'file:newMarkdown' in commandContracts,
    'session:restore' in commandContracts
  ],
  [true, true, true, true, true]
);

check(
  'a no-input command accepts the absent payload the native menu sends',
  parseCommandInput('format:bold', undefined),
  null
);
rejects('a no-input command refuses accidental data', 'format:bold', { style: 'bold' });

check(
  'a new note preserves the tree folder that chose its destination',
  parseCommandInput('file:newMarkdown', { folder: '/notes/history' }),
  { folder: '/notes/history' }
);
check(
  'the menu may ask for a new note without a folder',
  parseCommandInput('file:newMarkdown'),
  null
);
rejects('a new note refuses a non-string folder', 'file:newMarkdown', { folder: 7 });

check(
  'a table operation receives the menu target as numbers',
  parseCommandInput('table:deleteRow', { lineStart: 12, row: 1, column: 0 }),
  { lineStart: 12, row: 1, column: 0 }
);
rejects('a table operation refuses an infinite row', 'table:deleteRow', {
  lineStart: 12,
  row: Infinity,
  column: 0
});

check(
  'the table picker sizes are positive integers',
  parseCommandInput('table:insert', { rows: 3, columns: 4 }),
  { rows: 3, columns: 4 }
);
rejects('the table picker refuses a fractional row count', 'table:insert', {
  rows: 2.5,
  columns: 4
});

check(
  'a session id is a non-empty string',
  parseCommandInput('session:restore', 'note-7'),
  'note-7'
);
rejects('a session command refuses an empty id', 'session:drop', '');
check(
  'an export kind is optional because the old menu may omit it',
  parseCommandInput('file:export', undefined),
  null
);
rejects('an export kind cannot be a number', 'file:export', 3);

const incomplete = Object.entries(commandContracts).filter(
  ([, contract]) =>
    typeof contract.description !== 'string' ||
    contract.description.length === 0 ||
    ![
      'none',
      'document.write',
      'session.write',
      'workspace.write',
      'export.run',
      'version.write'
    ].includes(contract.effect) ||
    !['sync', 'async'].includes(contract.timing) ||
    !['public', 'internal'].includes(contract.exposure) ||
    typeof contract.parse !== 'function'
);
check(
  'every command has complete serializable metadata',
  incomplete.map(([id]) => id),
  []
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('command contracts: every command has one typed input');
