/**
 * Holds release updater configuration to the signing, endpoint and capability contract.
 */
import { readFileSync } from 'node:fs';

const failures = [];
const check = (name, condition) => {
  if (!condition) failures.push(name);
};

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');

check('updater artifacts are enabled', config.bundle.createUpdaterArtifacts === true);
check(
  'the latest GitHub release is the endpoint',
  config.plugins?.updater?.endpoints?.includes(
    'https://github.com/yungleung/yi/releases/latest/download/latest.json'
  )
);
check('the updater public key is configured', typeof config.plugins?.updater?.pubkey === 'string');
check(
  'the desktop capability grants updater access',
  capability.permissions.includes('updater:default')
);
check(
  'the desktop capability grants process restart access',
  capability.permissions.includes('process:default')
);
check('the updater plugin is initialized', rust.includes('tauri_plugin_updater::Builder::new()'));
check('the process plugin is initialized', rust.includes('tauri_plugin_process::init()'));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('updater config: signed GitHub release updates are enabled');
