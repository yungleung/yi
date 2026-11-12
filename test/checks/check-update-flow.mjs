/**
 * Checks the update controller's decisions with a fake backend and presenter:
 * startup stays quiet, manual checks explain themselves, and installs wait for consent.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const directory = mkdtempSync(join(tmpdir(), 'yi-update-flow-'));
const build = await rolldown({
  input: 'src/services/updates/flow.ts',
  logLevel: 'silent',
  platform: 'node'
});
const { output } = await build.generate({ format: 'esm' });
await build.close();
const file = join(directory, 'flow.mjs');
writeFileSync(file, output.find((chunk) => chunk.type === 'chunk').code);
const { UpdateController } = await import(pathToFileURL(file).href);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function remote(version = '1.1.0') {
  return {
    version,
    currentVersion: '0.1.0',
    notes: 'A focused release.',
    date: '2026-11-12T00:00:00Z',
    install: async () => {}
  };
}

function scenario({
  update = null,
  checkFailure = null,
  installFailure = null,
  confirm = true,
  checkDelay = 0
} = {}) {
  const calls = [];
  const events = [];
  const backend = {
    async check() {
      calls.push('check');
      if (checkDelay) await sleep(checkDelay);
      if (checkFailure) throw new Error(checkFailure);
      if (!update) return null;
      return {
        ...update,
        async install() {
          calls.push(`install:${update.version}`);
          if (installFailure) throw new Error(installFailure);
        }
      };
    },
    async relaunch() {
      calls.push('relaunch');
    }
  };
  const presenter = {
    async confirm(candidate) {
      calls.push(`confirm:${candidate.version}`);
      return confirm;
    },
    current() {
      events.push('current');
    },
    failed(message) {
      events.push(`failed:${message}`);
    }
  };
  return {
    controller: new UpdateController(backend, presenter),
    calls,
    events
  };
}

{
  const run = scenario();
  check('startup-current-is-quiet', await run.controller.check('startup'), 'current');
  check('startup-current-says-nothing', run.events, []);
}

{
  const run = scenario({ checkFailure: 'offline' });
  check('startup-failure-is-quiet', await run.controller.check('startup'), 'failed');
  check('startup-failure-says-nothing', run.events, []);
}

{
  const run = scenario();
  check('manual-current-says-current', await run.controller.check('manual'), 'current');
  check('manual-current-shows-a-hint', run.events, ['current']);
}

{
  const run = scenario({ checkFailure: 'offline' });
  check('manual-failure-says-failed', await run.controller.check('manual'), 'failed');
  check('manual-failure-shows-the-reason', run.events, ['failed:offline']);
}

{
  const run = scenario({ update: remote(), confirm: false });
  check('declined-update-stops-before-install', await run.controller.check('manual'), 'declined');
  check('declined-update-does-not-install', run.calls, ['check', 'confirm:1.1.0']);
}

{
  const run = scenario({ update: remote() });
  check('accepted-update-installs', await run.controller.check('manual'), 'installed');
  check('accepted-update-installs-then-relaunches', run.calls, [
    'check',
    'confirm:1.1.0',
    'install:1.1.0',
    'relaunch'
  ]);
}

{
  const run = scenario({ update: remote(), installFailure: 'signature rejected' });
  check('failed-install-is-recoverable', await run.controller.check('manual'), 'failed');
  check('failed-install-does-not-relaunch', run.calls, [
    'check',
    'confirm:1.1.0',
    'install:1.1.0'
  ]);
  check('manual-install-failure-is-visible', run.events, ['failed:signature rejected']);
}

{
  const run = scenario({ update: remote(), checkDelay: 30 });
  const results = await Promise.all([
    run.controller.check('manual'),
    run.controller.check('manual')
  ]);
  check('parallel-checks-share-one-result', results, ['installed', 'installed']);
  check('parallel-checks-run-one-request', run.calls, [
    'check',
    'confirm:1.1.0',
    'install:1.1.0',
    'relaunch'
  ]);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('update flow: consent, quiet startup and one in-flight check are enforced');
