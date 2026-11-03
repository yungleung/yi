/**
 * Checks the document-change producer and consumers share one event path:
 * the editor emits it, and no old split notification remains in app code.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const editor = 'src/ui/markdown/markdown_editor.ts';
const panel = 'src/ui/editor_panel.ts';
const words = 'src/ui/status_bar/words.ts';
const failures = [];
const require = (name, condition) => {
  if (!condition) failures.push(name);
};

const editorSource = readFileSync(editor, 'utf8');
const panelSource = readFileSync(panel, 'utf8');
const wordsSource = readFileSync(words, 'utf8');
require(`${editor} delegates document changes to its host`, /documentChanged\(/.test(editorSource));
require(
  `${panel} adapts the host event to DOCUMENT_CHANGED`,
  /emit\(\s*DOCUMENT_CHANGED,\s*payload\)/.test(panelSource)
);
require(`${panel} listens for document changes`, /on\(\s*DOCUMENT_CHANGED/.test(panelSource));
require(`${words} listens for document changes`, /on\(\s*DOCUMENT_CHANGED/.test(wordsSource));
require(`${words} reads the payload text`, /payload\.text/.test(wordsSource));

const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
})('src');
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  require(
    `${file} has no old split change event`,
    !/editor_edited|markdown_content_changed/.test(source)
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('document change: one producer feeds one typed event');
