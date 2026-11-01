/**
 * Holds the domain-folder migration in place.
 *
 * Example: `services/session/model.ts` passes, while `services/session_model.ts` fails as a legacy
 * path; a domain `index.ts` that re-exports its internals with `export *` also fails.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const exists = (path) => existsSync(join(root, path));

const expectFile = (path) => {
  if (!exists(path)) {
    failures.push(`missing required module: ${path}`);
  }
};

const forbidFile = (path) => {
  if (exists(path)) {
    failures.push(`legacy module still exists: ${path}`);
  }
};

const expectNoRepeat = (folder, prefixes = [], suffixes = []) => {
  for (const name of readdirSync(join(root, folder))) {
    if (
      prefixes.some((prefix) => name.startsWith(prefix)) ||
      suffixes.some((suffix) => name.endsWith(suffix))
    ) {
      failures.push(`${folder}/${name} repeats its parent-domain prefix`);
    }
  }
};

const expectExplicitFacade = (path) => {
  expectFile(path);
  if (!exists(path)) {
    return;
  }
  const source = readFileSync(join(root, path), 'utf8');
  if (/export\s+\*\s+from/.test(source)) {
    failures.push(`${path} uses a wildcard public export`);
  }
};

const expectNoDefinition = (path, pattern, message) => {
  expectFile(path);
  if (!exists(path)) {
    return;
  }
  const source = readFileSync(join(root, path), 'utf8');
  if (pattern.test(source)) {
    failures.push(`${path} ${message}`);
  }
};

const expectNoDeepImport = (folder, importPrefix, domain) => {
  for (const name of readdirSync(join(root, folder))) {
    if (!name.endsWith('.ts')) {
      continue;
    }
    const path = `${folder}/${name}`;
    const source = readFileSync(join(root, path), 'utf8');
    if (new RegExp(`from\\s+['"]${importPrefix}[^'"]+['"]`).test(source)) {
      failures.push(`${path} imports inside ${domain}; use its public entrypoint`);
    }
  }
};

expectFile('src/ui/workspace/tree/node.ts');
expectFile('src/ui/export/manager/source.ts');
expectFile('src/ui/export/manager/navigation.ts');
expectFile('src/ui/export/templates/operations.ts');
expectFile('src/ui/export/dialog/controls.ts');

const facades = [
  'src/services/session/index.ts',
  'src/services/session/rules.ts',
  'src/services/workspace/index.ts',
  'src/services/new_document/index.ts',
  'src/services/events/index.ts',
  'src/services/bibliography/index.ts',
  'src/services/documents/index.ts',
  'src/services/versioning/index.ts',
  'src/ui/documentation/index.ts',
  'src/ui/image/index.ts',
  'src/ui/settings/index.ts',
  'src/ui/table/index.ts',
  'src/ui/toolbar/index.ts',
  'src/ui/tutorial/index.ts',
  'src/ui/workspace/index.ts',
  'src/ui/workspace/tree/index.ts',
  'src/ui/versioning/index.ts',
  'src/ui/workspace_setup/index.ts',
  'src/ui/markdown/editor/index.ts',
  'src/ui/markdown/renderer/index.ts',
  'src/ui/export/workflow/index.ts',
  'src/ui/export/pipeline/index.ts',
  'src/ui/export/assets/index.ts',
  'src/ui/export/reference/index.ts',
  'src/ui/export/dialog/index.ts',
  'src/ui/export/manager/index.ts',
  'src/ui/export/templates/index.ts',
  'src-tauri/src/fonts/bundled/mod.rs',
  'src-tauri/src/export/html/mod.rs'
];
facades.forEach(expectExplicitFacade);

expectNoDefinition(
  'src/ui/workspace/tree/index.ts',
  /\bclass\s+TreeNode\b/,
  'still owns TreeNode; move it to its focused module'
);
expectNoDefinition(
  'src/ui/export/manager/index.ts',
  /\bexport\s+(?:interface|const)\s+(?:ExportManagerSource|liveExportManagerSource)\b/,
  'still owns the export-manager source adapter; move it to source.ts'
);
expectNoDeepImport('src/ui/export/manager', '../templates/', 'the template domain');
expectNoDefinition(
  'src/ui/export/templates/browser.ts',
  /\b(?:createDefaultTemplate|duplicateTemplate|exportTemplates|importTemplate|inspectTemplate|removeTemplate|testTemplatePdf|updateTemplate|validateTemplate)\s*\(/,
  'still owns template lifecycle calls; move them to operations.ts'
);
expectNoDefinition(
  'src/ui/export/dialog/form.ts',
  /\b(?:private\s+button\s*\(|function\s+(?:element|label|textBlock|select|checkbox|diagnostic|option|labelledRow|rowGroup|buttonRow|checkboxRow)\s*\()/,
  'still owns export-form DOM controls; move them to controls.ts'
);

const legacy = [
  'src/services/session.ts',
  'src/services/session_rules.ts',
  'src/services/workspace_folders.ts',
  'src/services/workspace_setup.ts',
  'src/services/new_document_builtins.ts',
  'src/services/event_manager.ts',
  'src/services/app_events.ts',
  'src/services/document_identity.ts',
  'src/services/document_manager.ts',
  'src/services/citation_reference.ts',
  'src/ui/workspace/tree.ts',
  'src/ui/workspace/tree_ops.ts',
  'src/ui/versioning/save_version.ts',
  'src/ui/versioning/version_status.ts',
  'src/ui/workspace_setup/workspace_setup_flow.ts',
  'src/ui/markdown/editor_history.ts',
  'src/ui/markdown/renderer_geometry.ts',
  'src/ui/export/export_flow.ts',
  'src/ui/export/preprocess.ts',
  'src/ui/export/raster_picture.ts',
  'src/ui/export/reference_header.ts',
  'src-tauri/src/fonts/bundled.rs',
  'src-tauri/src/export/html_attributes.rs',
  'src-tauri/src/export/html_media'
];
legacy.forEach(forbidFile);

expectNoRepeat('src/services/session', ['session_']);
expectNoRepeat('src/services/workspace', ['workspace_']);
expectNoRepeat('src/services/new_document', ['new_document_']);
expectNoRepeat('src/ui/versioning', ['version_']);
expectNoRepeat('src/ui/toolbar', [], ['_toolbar.ts']);
expectNoRepeat('src/ui/settings', [], ['_settings.ts']);
expectNoRepeat('src/ui/image', ['image_']);
expectNoRepeat('src/ui/table', ['table_']);
expectNoRepeat('src/ui/tutorial', ['tutorial_']);
expectNoRepeat('src/ui/toolbar', ['toolbar_']);
expectNoRepeat('src/ui/workspace/tree', ['tree_']);
expectNoRepeat('src/ui/workspace_setup', ['workspace_setup_']);
expectNoRepeat('src/ui/export/workflow', ['export_']);
expectNoRepeat('src/ui/export/manager', ['export_manager']);
expectNoRepeat('src/ui/export/templates', ['package_', 'template_']);
expectNoRepeat('src/ui/markdown/editor', ['editor_']);
expectNoRepeat('src/ui/markdown/renderer', ['renderer_']);
expectNoRepeat('src-tauri/src/fonts/bundled', ['bundled_']);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('module layout: all checks passed');
