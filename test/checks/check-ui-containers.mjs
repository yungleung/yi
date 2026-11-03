/**
 * Holds the title-bar and status-bar domains to their approved module boundaries.
 *
 * Example: `ui/status_bar/document.ts` is the home of saved and stacked status, while
 * `ui/document_status.ts` is a legacy path that must not return.
 */
import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const expect = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

for (const path of [
  'src/ui/status_bar/index.ts',
  'src/ui/status_bar/document.ts',
  'src/ui/status_bar/words.ts',
  'src/ui/status_bar/layout.ts',
  'src/ui/status_bar/version.ts',
  'src/ui/status_bar/export_progress.ts',
  'src/ui/status_bar/button.ts',
  'src/ui/status_bar/tone.ts',
  'src/ui/status_bar.ts',
  'src/ui/title_bar.ts',
  'src/ui/toolbar.ts',
  'src/ui/toolbar/index.ts',
  'src/services/export_activity.ts'
]) {
  expect(existsSync(path), `missing domain module: ${path}`);
}

for (const path of [
  'src/ui/document_status.ts',
  'src/ui/words_count.ts',
  'src/ui/status_bar/bar.ts',
  'src/ui/title_bar/bar.ts',
  'src/ui/title_bar/index.ts',
  'src/ui/toolbar/base.ts',
  'src/ui/toolbar/layout.ts',
  'src/ui/versioning/status.ts',
  'src/ui/export/workflow/progress.ts'
]) {
  expect(!existsSync(path), `legacy module still exists: ${path}`);
}

const main = read('src/main.ts');
expect(main.includes("from './ui/status_bar'"), 'main mounts the generic status-bar container');
expect(main.includes("from './ui/status_bar/index'"), 'main composes addable status components');
expect(main.includes("from './ui/title_bar'"), 'main mounts the generic title-bar container');
expect(
  main.includes('new StatusBar') &&
    main.includes('statusBar.addComponent(wordsCount,') &&
    main.includes('statusBar.addComponent(versionStatus,'),
  'main keeps composing items into the generic status-bar container'
);

const statusIndex = read('src/ui/status_bar/index.ts');
const toolbarIndex = read('src/ui/toolbar/index.ts');
const statusBar = read('src/ui/status_bar.ts');
const titleBar = read('src/ui/title_bar.ts');
const toolbar = read('src/ui/toolbar.ts');
expect(!/export\s+\*\s+from/.test(statusIndex), 'status-bar facade has named exports');
expect(statusBar.includes('addComponent('), 'status bar stays a generic component container');
expect(titleBar.includes('addComponent('), 'title bar stays a generic component container');
expect(toolbar.includes('abstract class Toolbar'), 'toolbar stays a generic component container');
expect(
  !/export\s*\{[^}]*\bStatusBar\b/.test(statusIndex),
  'the status component collection excludes its container'
);
expect(
  !/export\s*\{[^}]*\bToolbar\b/.test(toolbarIndex),
  'the toolbar component collection excludes its container'
);
expect(
  !read('src/ui/toolbar/index.ts').includes('LayoutToolbar'),
  'the status-only layout control is not exported by the title-bar toolbar'
);

const activity = read('src/services/export_activity.ts');
expect(activity.includes('export_activity_changed'), 'export activity emits one typed local fact');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('UI containers: status and title bars have closed public domains');
