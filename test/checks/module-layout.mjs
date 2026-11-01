/**
 * Holds the domain-folder migration in place.
 *
 * Example: `services/session/model.ts` passes, while `services/session_model.ts` fails as a legacy
 * path; a domain `index.ts` that re-exports its internals with `export *` also fails.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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
  if (!exists(folder)) {
    return;
  }
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

const sourceFiles = (folder, extensions) => {
  const files = [];
  const walk = (path) => {
    for (const name of readdirSync(join(root, path))) {
      const child = `${path}/${name}`;
      if (statSync(join(root, child)).isDirectory()) {
        walk(child);
        continue;
      }
      if (extensions.some((extension) => name.endsWith(extension))) {
        files.push(child);
      }
    }
  };
  if (exists(folder)) {
    walk(folder);
  }
  return files;
};

const resolveImport = (from, specifier) => {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const base = resolve(root, dirname(from), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    join(base, 'index.ts'),
    `${base}.rs`,
    join(base, 'mod.rs')
  ];
  const found = candidates.find((path) => existsSync(path));
  return found === undefined ? null : relative(root, found);
};

const expectNoFacadeBypass = () => {
  const files = sourceFiles('src', ['.ts']).filter((path) => !path.endsWith('.d.ts'));
  const facades = files.filter((path) => path.endsWith('/index.ts'));
  for (const facade of facades) {
    const folder = dirname(facade);
    const parent = dirname(folder);
    const nestedOwner = facades.includes(`${parent}/index.ts`);
    for (const importer of files) {
      if (importer.startsWith(`${folder}/`)) {
        continue;
      }
      const source = readFileSync(join(root, importer), 'utf8');
      for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
        const target = resolveImport(importer, match[1]);
        if (
          target === null ||
          !target.startsWith(`${folder}/`) ||
          target === facade ||
          (nestedOwner && importer.startsWith(`${parent}/`))
        ) {
          continue;
        }
        failures.push(`${importer} bypasses ${facade}; import its public entrypoint`);
      }
    }
  }
};

const expectNoExportCycles = () => {
  const folder = 'src/ui/export';
  const files = sourceFiles(folder, ['.ts']).filter((path) => !path.endsWith('.d.ts'));
  const domain = (path) => {
    const parts = path.split('/');
    return parts.length > 3 ? `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}` : null;
  };
  const edges = new Map();
  for (const importer of files) {
    const from = domain(importer);
    if (from === null) {
      continue;
    }
    const source = readFileSync(join(root, importer), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const target = resolveImport(importer, match[1]);
      const to = target === null ? null : domain(target);
      if (to === null || to === from) {
        continue;
      }
      if (!edges.has(from)) {
        edges.set(from, new Set());
      }
      edges.get(from).add(to);
    }
  }
  const visit = (node, stack) => {
    const cycleAt = stack.indexOf(node);
    if (cycleAt >= 0) {
      failures.push(`export domains form a cycle: ${[...stack.slice(cycleAt), node].join(' -> ')}`);
      return true;
    }
    for (const next of edges.get(node) ?? []) {
      if (visit(next, [...stack, node])) {
        return true;
      }
    }
    return false;
  };
  for (const node of edges.keys()) {
    if (visit(node, [])) {
      return;
    }
  }
};

const expectNoRepeatedPrefix = () => {
  const allowed = new Set([
    'src/ui/markdown/markdown_editor.ts'
  ]);
  for (const path of sourceFiles('src', ['.ts']).concat(sourceFiles('src-tauri/src', ['.rs']))) {
    if (allowed.has(path) || path.endsWith('/index.ts') || path.endsWith('/mod.rs')) {
      continue;
    }
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    const parent = parts.pop() ?? '';
    const stem = name.replace(/\.(?:ts|rs)$/, '');
    if (stem.startsWith(`${parent}_`)) {
      failures.push(`${path} repeats its parent-domain prefix`);
    }
  }
};

expectFile('src/ui/workspace/tree/node.ts');
expectFile('src/ui/export/manager/source.ts');
expectFile('src/ui/export/manager/navigation.ts');
expectFile('src/ui/export/templates/operations.ts');
expectFile('src/ui/export/templates/editor_shell.ts');
expectFile('src/ui/export/dialog/controls.ts');
expectFile('src/ui/export/pipeline/contracts.ts');
expectFile('src/ui/export/pipeline/rewrites.ts');
expectFile('src/ui/export/pipeline/figure_rewrites.ts');
expectFile('src/ui/export/pipeline/listing_rewrites.ts');
expectFile('src/ui/markdown/syntax/equation/index.ts');
expectFile('src/ui/markdown/syntax/equation/blocks.ts');
expectFile('src/ui/markdown/syntax/equation/masking.ts');
expectFile('src/ui/markdown/syntax/callout/index.ts');
expectFile('src/ui/markdown/syntax/callout/model.ts');
expectFile('src/ui/markdown/syntax/callout/reader.ts');
expectFile('src/ui/markdown/syntax/callout/body.ts');
expectFile('src/ui/markdown/syntax/callout/parser_source.ts');
expectFile('src/ui/markdown/syntax/callout/kind_edit.ts');
expectFile('src/ui/markdown/syntax/table/index.ts');
expectFile('src/ui/markdown/syntax/table/source.ts');
expectFile('src/ui/markdown/syntax/table/captions.ts');
expectFile('src/ui/markdown/syntax/table/edits.ts');
expectFile('src/ui/markdown/syntax/table/commands.ts');
expectFile('src/ui/markdown/syntax/list/index.ts');
expectFile('src/ui/markdown/syntax/list/captions.ts');
expectFile('src/ui/markdown/syntax/list/edits.ts');
expectFile('src/ui/markdown/syntax/code/index.ts');
expectFile('src/ui/markdown/syntax/code/fences.ts');
expectFile('src/ui/markdown/syntax/code/edits.ts');
expectFile('src/ui/markdown/syntax/code/listings.ts');
expectFile('src/ui/markdown/syntax/footnote/index.ts');
expectFile('src/ui/markdown/syntax/footnote/model.ts');
expectFile('src/ui/markdown/syntax/footnote/labels.ts');
expectFile('src/ui/markdown/syntax/footnote/parse_context.ts');
expectFile('src/ui/markdown/syntax/footnote/edits.ts');
expectFile('src/ui/markdown/syntax/container/index.ts');
expectFile('src/ui/markdown/syntax/container/divs.ts');
expectFile('src/ui/markdown/syntax/container/fence_edits.ts');
expectFile('src/ui/markdown/syntax/container/quote/index.ts');
expectFile('src/ui/markdown/syntax/container/quote/lines.ts');
expectFile('src/ui/markdown/syntax/container/quote/edits.ts');
expectFile('src/ui/markdown/syntax/container/quote/projection.ts');
expectFile('src/ui/markdown/syntax/citation_keys.ts');
expectFile('src/ui/markdown/source_mode/index.ts');
expectFile('src/ui/markdown/source_mode/state.ts');
expectFile('src/ui/markdown/source_mode/block.ts');
expectFile('src/ui/markdown/source_mode/node.ts');
expectFile('src/ui/markdown/block_views/equation.ts');
expectFile('src/ui/markdown/block_views/fence.ts');
expectFile('src/ui/markdown/block_views/source.ts');
expectFile('src/ui/markdown/editing/blank_lines/index.ts');
expectFile('src/ui/markdown/editing/blank_lines/paragraph.ts');
expectFile('src/ui/markdown/editing/blank_lines/list.ts');
expectFile('src/ui/markdown/editing/blank_lines/deletion.ts');
expectFile('src/ui/export/node_spans.ts');
expectFile('src/ui/export/kind_label.ts');
expectFile('src/ui/export/assets/contracts.ts');
expectFile('src/ui/export/templates/availability.ts');
expectFile('src/ui/export/reference/header.ts');
expectFile('src/ui/export/workflow/body.ts');
expectFile('src/ui/new_document/index.ts');
expectFile('src/ui/new_document/dialog.ts');
expectFile('src/ui/new_document/flow.ts');
expectFile('src/ui/session/index.ts');
expectFile('src/ui/session/commands.ts');
expectFile('src/ui/session/stack.ts');
expectFile('src/ui/floating/index.ts');
expectFile('src-tauri/src/settings/mod.rs');
expectFile('src-tauri/src/settings/model.rs');
expectFile('src-tauri/src/settings/store.rs');
expectFile('src-tauri/src/menu/mod.rs');
expectFile('src-tauri/src/menu/build.rs');
expectFile('src-tauri/src/menu/events.rs');

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
  'src/ui/markdown/syntax/equation/index.ts',
  'src/ui/markdown/syntax/callout/index.ts',
  'src/ui/markdown/syntax/table/index.ts',
  'src/ui/markdown/syntax/list/index.ts',
  'src/ui/markdown/syntax/code/index.ts',
  'src/ui/markdown/syntax/footnote/index.ts',
  'src/ui/markdown/syntax/container/index.ts',
  'src/ui/markdown/syntax/container/quote/index.ts',
  'src/ui/markdown/source_mode/index.ts',
  'src/ui/markdown/editing/blank_lines/index.ts',
  'src/ui/export/workflow/index.ts',
  'src/ui/export/pipeline/index.ts',
  'src/ui/export/assets/index.ts',
  'src/ui/export/reference/index.ts',
  'src/ui/export/dialog/index.ts',
  'src/ui/export/manager/index.ts',
  'src/ui/export/templates/index.ts',
  'src/ui/new_document/index.ts',
  'src/ui/session/index.ts',
  'src/ui/floating/index.ts',
  'src-tauri/src/files/mod.rs',
  'src-tauri/src/fonts/mod.rs',
  'src-tauri/src/fonts/bundled/mod.rs',
  'src-tauri/src/export/mod.rs',
  'src-tauri/src/export/templates/mod.rs',
  'src-tauri/src/export/html/mod.rs',
  'src-tauri/src/versioning/mod.rs',
  'src-tauri/src/settings/mod.rs',
  'src-tauri/src/menu/mod.rs'
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
  'src/ui/export/templates/editor.ts',
  /\b(?:private\s+button\s*\(|data-template-editor-panel\b)/,
  'still owns template-editor shell construction; move it to editor_shell.ts'
);
expectNoDefinition(
  'src/ui/export/dialog/form.ts',
  /\b(?:private\s+button\s*\(|function\s+(?:element|label|textBlock|select|checkbox|diagnostic|option|labelledRow|rowGroup|buttonRow|checkboxRow)\s*\()/,
  'still owns export-form DOM controls; move them to controls.ts'
);
expectNoDefinition(
  'src/ui/export/pipeline/preprocess.ts',
  /\b(?:export\s+(?:interface|type)\s+(?:TitleLookup|FileExists|ExportAnswers|CitationRendering|Rewrite)\b|function\s+(?:applyRewrites|figureRewrites|figureHtml|figureAttributes|listingRewrites)\s*\()/,
  'still owns shared pipeline contracts or focused rewrite modules'
);
expectNoDefinition(
  'src/ui/export/pipeline/callout_rewrites.ts',
  /\bfunction\s+applyRewrites\s*\(/,
  'duplicates the shared right-to-left rewrite rule'
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
  'src/ui/markdown/syntax/equation_blocks.ts',
  'src/ui/markdown/syntax/equation_masking.ts',
  'src/ui/markdown/syntax/callout_model.ts',
  'src/ui/markdown/syntax/callout_reader.ts',
  'src/ui/markdown/syntax/callout_body.ts',
  'src/ui/markdown/syntax/callout_parser_source.ts',
  'src/ui/markdown/syntax/callout_kind_edit.ts',
  'src/ui/markdown/syntax/callouts.ts',
  'src/ui/markdown/syntax/table_source.ts',
  'src/ui/markdown/syntax/table_captions.ts',
  'src/ui/markdown/syntax/table_edits.ts',
  'src/ui/markdown/syntax/table_commands.ts',
  'src/ui/markdown/syntax/list_captions.ts',
  'src/ui/markdown/syntax/list_edits.ts',
  'src/ui/markdown/syntax/code_fences.ts',
  'src/ui/markdown/syntax/code_edits.ts',
  'src/ui/markdown/syntax/listings.ts',
  'src/ui/markdown/syntax/footnotes.ts',
  'src/ui/markdown/syntax/quote_edits.ts',
  'src/ui/markdown/syntax/fenced_divs.ts',
  'src/ui/markdown/syntax/fence_edits.ts',
  'src/ui/markdown/source_mode.ts',
  'src/ui/markdown/editing/blank_lines.ts',
  'src/ui/markdown/block_views.ts',
  'src/ui/export/export_flow.ts',
  'src/ui/export/preprocess.ts',
  'src/ui/export/raster_picture.ts',
  'src/ui/export/reference_header.ts',
  'src/ui/export/pipeline/node_spans.ts',
  'src/ui/export/pipeline/book_body.ts',
  'src/ui/export/templates/kind_label.ts',
  'src/ui/export/reference/reference_header.ts',
  'src/ui/new_document/new_document_dialog.ts',
  'src/ui/new_document/new_document_flow.ts',
  'src/ui/session/session_commands.ts',
  'src/ui/session/stack_popover.ts',
  'src-tauri/src/settings.rs',
  'src-tauri/src/menu.rs',
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
expectNoRepeat('src/ui/markdown/syntax/equation', ['equation_']);
expectNoRepeat('src/ui/markdown/syntax/callout', ['callout_']);
expectNoRepeat('src/ui/markdown/syntax/table', ['table_']);
expectNoRepeat('src/ui/markdown/syntax/list', ['list_']);
expectNoRepeat('src/ui/markdown/syntax/code', ['code_']);
expectNoRepeat('src/ui/markdown/syntax/footnote', ['footnote_']);
expectNoRepeat('src/ui/markdown/syntax/container', ['container_']);
expectNoRepeat('src/ui/markdown/syntax/container/quote', ['quote_']);
expectNoRepeat('src-tauri/src/fonts/bundled', ['bundled_']);
expectNoFacadeBypass();
expectNoExportCycles();
expectNoRepeatedPrefix();

for (const path of sourceFiles('src-tauri/src', ['.rs'])) {
  if (path.startsWith('src-tauri/src/fonts/')) {
    continue;
  }
  const source = readFileSync(join(root, path), 'utf8');
  if (/crate::fonts::(?:bundled|file|system)::/.test(source)) {
    failures.push(`${path} bypasses the fonts domain facade`);
  }
}
for (const path of sourceFiles('src-tauri/src', ['.rs'])) {
  if (path === 'src-tauri/src/files/mod.rs' || path.startsWith('src-tauri/src/files/')) {
    continue;
  }
  const source = readFileSync(join(root, path), 'utf8');
  if (/files::(?:atomic|listing)::/.test(source)) {
    failures.push(`${path} bypasses the files command facade`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('module layout: all checks passed');
