/**
 * Checks local fact delivery: subscription order, unsubscribe, unique envelopes,
 * correlation, and isolation from a failing listener.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-local-events-'));
const build = await rolldown({ input: 'src/events/local_bus.ts', logLevel: 'silent' });
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'local_bus.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { LocalEventBus } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

const logged = [];
const bus = new LocalEventBus({
  onListenerError: (error) => logged.push(error.message),
  idPrefix: 'test-event'
});
const calls = [];
const unsubscribeFirst = bus.on('workspace_changed', (event) => {
  calls.push(`first:${event.payload}`);
});
bus.on('workspace_changed', (event) => {
  calls.push(`second:${event.payload}`);
});

const first = bus.emit('workspace_changed', '/notes/history', {
  correlationId: 'command-7'
});
check('both listeners run in subscription order', calls, [
  'first:/notes/history',
  'second:/notes/history'
]);
check('the envelope carries the event name', first.name, 'workspace_changed');
check('the envelope carries the payload', first.payload, '/notes/history');
check('the envelope carries the caller correlation', first.correlationId, 'command-7');
check('the envelope has a unique id', first.id.length > 0, true);

unsubscribeFirst();
bus.emit('workspace_changed', '/notes/physics');
check('an unsubscribed listener stops hearing events', calls.slice(-1), [
  'second:/notes/physics'
]);

const second = bus.emit('workspace_changed', '/notes/chemistry');
check('each delivery has a new identity', first.id === second.id, false);

bus.on('workspace_changed', () => {
  throw new Error('listener failed');
});
bus.on('workspace_changed', (event) => calls.push(`after:${event.payload}`));
bus.emit('workspace_changed', '/notes/math');
check('a throwing listener is reported', logged, ['listener failed']);
check('and later listeners still receive the fact', calls.slice(-1), ['after:/notes/math']);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('local events: one typed synchronous delivery path');
