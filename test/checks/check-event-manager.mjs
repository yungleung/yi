/**
 * Checks that the app event manager composes local delivery with inbound Tauri
 * listeners, rather than serializing every same-window fact through Tauri.
 */
import { readFileSync } from 'node:fs';

const file = 'src/services/event_manager.ts';
const source = readFileSync(file, 'utf8');
const failures = [];
const require = (name, condition) => {
  if (!condition) {
    failures.push(`${file}: ${name}`);
  }
};

require('imports LocalEventBus', /from ['"]\.\.\/events\/local_bus['"]/.test(source));
require('uses a local bus', /\bnew LocalEventBus\b/.test(source));
require('uses the declared event boundary', /\bisInboundEvent\s*\(/.test(source));
require('keeps Tauri listen', /\blisten\s*\(/.test(source));
require('forwards inbound payloads locally', /\blocal\.emit\s*\(/.test(source));
require(
  'does not import Tauri emit',
  !/import\s*\{[^}]*\bemit\b[^}]*\}\s*from ['"]@tauri-apps\/api\/event['"]/.test(source)
);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('event manager: local delivery with inbound Tauri transport');
