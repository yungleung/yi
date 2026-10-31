/**
 * Checks command dispatch as behavior: malformed, forbidden, unavailable or
 * throwing commands cannot report success, and a successful command keeps its
 * caller's correlation id.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-command-dispatch-'));

async function bundleModule(input, name) {
  const build = await rolldown({ input, logLevel: 'silent' });
  const { output } = await build.generate({ format: 'esm' });
  await build.close();
  const file = join(directory, `${name}.mjs`);
  writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
  return import(file);
}

const { CommandRegistry } = await bundleModule('src/commands/registry.ts', 'registry');
const { CommandDispatcher } = await bundleModule('src/commands/dispatch.ts', 'dispatch');
const { localAccess } = await bundleModule('src/commands/authority.ts', 'authority');

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const origin = { kind: 'toolbar', windowId: 'main' };
const access = localAccess(true);
const registry = new CommandRegistry();
const dispatcher = new CommandDispatcher(registry, () => access);
registry.register({
  id: 'edit:insertRule',
  run: (input, context) => ({ input, correlationId: context.correlationId })
});
registry.register({
  id: 'session:restore',
  run: () => null
});

const first = dispatcher.dispatch('edit:insertRule', null, origin, {
  correlationId: 'run-7'
});
check('a sync command returns a result directly', first instanceof Promise, false);
check('and the result is successful', first.ok, true);
check('and it carries the caller correlation id', first.correlationId, 'run-7');

const invalid = dispatcher.dispatch('session:restore', '', origin, {
  correlationId: 'run-8'
});
check('invalid external input is refused', invalid.code, 'invalid-input');
check('and the result names the command', invalid.commandId, 'session:restore');

const forbiddenRegistry = new CommandRegistry();
forbiddenRegistry.register({
  id: 'edit:insertRule',
  run: () => {
    throw new Error('must not run');
  }
});
const forbidden = new CommandDispatcher(forbiddenRegistry, () =>
  localAccess(false)
).dispatch('edit:insertRule', null, origin, { correlationId: 'run-9' });
check('a read-only document refuses a document write', forbidden.code, 'forbidden');

const unavailableRegistry = new CommandRegistry();
unavailableRegistry.register({
  id: 'edit:insertRule',
  available: () => false,
  run: () => null
});
const unavailable = new CommandDispatcher(unavailableRegistry, () => access).dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-10' }
);
check('an unavailable command is refused', unavailable.code, 'unavailable');

const asyncRegistry = new CommandRegistry();
asyncRegistry.register({
  id: 'file:save',
  run: async () => null
});
const asyncResult = await new CommandDispatcher(asyncRegistry, () => access).dispatch(
  'file:save',
  null,
  origin,
  { correlationId: 'run-11' }
);
check('an async command resolves through a result', asyncResult.ok, true);

const throwingRegistry = new CommandRegistry();
throwingRegistry.register({
  id: 'edit:insertRule',
  run: () => {
    throw new Error('no selection');
  }
});
const failed = new CommandDispatcher(throwingRegistry, () => access).dispatch(
  'edit:insertRule',
  null,
  origin,
  { correlationId: 'run-12' }
);
check('a thrown feature error becomes a failed result', failed.code, 'failed');
check('and the result preserves the reason', failed.message, 'no selection');

let duplicate = '';
const duplicateRegistry = new CommandRegistry();
const definition = { id: 'edit:insertRule', run: () => null };
duplicateRegistry.register(definition);
try {
  duplicateRegistry.register(definition);
} catch (error) {
  duplicate = error instanceof Error ? error.message : String(error);
}
check(
  'registering one id twice is an explicit bug',
  duplicate,
  'duplicate command: edit:insertRule'
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('command dispatch: one typed, authorized result path');
