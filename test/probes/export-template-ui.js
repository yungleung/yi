/**
 * The reader's path through the feature: the Template row, the library, an inspected import, the
 * code panel with YAML/LaTeX highlighting, an edit saved to the package, and validation — with
 * nothing entering the session stack.
 *
 * The native pickers cannot be driven from a probe, so the path field the library shows under test
 * is the same inspect call a picker's answer reaches.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const editorModule = await t.app('/src/ui/export/templates/editor.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const checkout = window.__probePaths.checkout;
  const stamp = Date.now().toString(36);
  const name = `Probe UI ${stamp}`;
  const before = await invoke('get_config');
  const stackBefore = session.documentSession.stack().length;
  // The library is the reader's: a package they already chose for HTML must not turn this run's
  // first assertion into a different starting point.
  const templates = { ...(before.export_templates ?? {}) };
  delete templates.html;
  await configManager.update({ export_templates: templates });
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element !== null && !element.classList.contains('hidden');
  };
  const until = async (ready, tries = 80) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) {
        return true;
      }
      await sleep(50);
    }
    return false;
  };
  let importedId = null;
  let incompatibleId = null;
  try {
    const incompatible = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/latex-kit`,
      name: `Incompatible LaTeX ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    incompatibleId = incompatible.id;
    await configManager.update({
      export_templates: { ...(configManager.get()?.export_templates ?? {}), html: incompatibleId }
    });
    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    check('the export card opens with a Template row', await until(() => visible('[data-export-dialog]')), {
      open: visible('[data-export-dialog]')
    });
    const row = document.querySelector('[data-export-template]');
    check(
      'and a package remembered for another kind is not used or shown',
      (row?.textContent ?? '').includes("Pandoc's default"),
      row?.textContent ?? null
    );

    document.querySelector('[data-export-choose-template]').click();
    check('Choose… opens the package library', await until(() => visible('[data-template-library]')), {
      open: visible('[data-template-library]')
    });
    check(
      'the chooser lists only packages for the chosen HTML kind',
      document.querySelector(`[data-template-package-id="${incompatibleId}"]`) === null,
      {
        incompatible: document.querySelector(`[data-template-package-id="${incompatibleId}"]`)
          ?.textContent
      }
    );
    document.querySelector('[data-template-inspect-path]').click();
    await sleep(80);
    document.querySelector('[data-template-import-path]').value =
      `${checkout}test/fixtures/templates/html-marker`;
    document.querySelector('[data-template-cancel]').click();
    await sleep(120);
    document.querySelector('[data-export-choose-template]').click();
    check(
      'reopening the chooser clears the previous import path and status',
      (await until(() => visible('[data-template-library]'))) &&
        document.querySelector('[data-template-import-path]')?.value === '' &&
        document.querySelector('[data-template-library-status]')?.textContent === '',
      {
        path: document.querySelector('[data-template-import-path]')?.value ?? null,
        status: document.querySelector('[data-template-library-status]')?.textContent ?? null
      }
    );
    document.querySelector('[data-template-import-path]').value = `${checkout}test/fixtures/templates/html-marker`;
    document.querySelector('[data-template-inspect-path]').click();
    check(
      'inspecting a folder opens the proposal before anything is copied',
      await until(() => visible('[data-template-import]')),
      { open: visible('[data-template-import]') }
    );
    check(
      'the proposal says the entry, its kind and its files',
      document.querySelector('[data-template-import-entry]')?.value === 'kit.html' &&
        document.querySelector('[data-template-import-kind]')?.value === 'html' &&
        (document.querySelector('[data-template-import-files]')?.textContent ?? '').includes('kit.html'),
      {
        entry: document.querySelector('[data-template-import-entry]')?.value,
        kind: document.querySelector('[data-template-import-kind]')?.value
      }
    );
    document.querySelector('[data-template-import-name]').value = name;
    document.querySelector('[data-template-import-source]').value = 'https://example.test/template';
    document.querySelector('[data-template-import-license]').value = 'CC BY 4.0';
    document.querySelector('[data-template-import-run]').click();
    check('importing opens the generated entry in the code panel', await until(() => visible('[data-template-editor]')), {
      editor: visible('[data-template-editor]')
    });
    const created = (await api.exportTemplates()).find((summary) => summary.manifest?.name === name);
    importedId = created?.id ?? null;
    check(
      'the package was written with the provenance the form carried',
      created?.manifest?.origin.license === 'CC BY 4.0' &&
        created?.manifest?.origin.source === 'https://example.test/template',
      created?.manifest ?? null
    );
    check(
      'the code panel is CodeMirror with line numbers and the package’s text files',
      document.querySelector('[data-template-editor] .cm-editor') !== null &&
        document.querySelector('[data-template-editor] .cm-gutters') !== null &&
        document.querySelector('[data-template-file="kit.html"]') !== null &&
        document.querySelector('[data-template-file="template.json"]') !== null,
      {
        code: document.querySelector('[data-template-editor] .cm-editor') !== null,
        files: [...document.querySelectorAll('[data-template-file]')].map((file) => file.dataset.templateFile)
      }
    );
    document.querySelector('[data-template-file="template.json"] button').click();
    await sleep(150);
    const view = editorModule.templateEditorPanel.view;
    check(
      'the manifest has a raw view and is read-only there',
      view !== null && view.state.readOnly === true,
      { readOnly: view?.state.readOnly }
    );
    document.querySelector('[data-template-file="kit.html"] button').click();
    await sleep(150);
    const entry = editorModule.templateEditorPanel.view;
    entry.dispatch({
      changes: { from: entry.state.doc.length, insert: '\n<!-- probe saved this -->\n' }
    });
    await sleep(80);
    check(
      'a change marks the file unsaved',
      (document.querySelector('[data-template-editor-dirty]')?.textContent ?? '').includes('unsaved'),
      document.querySelector('[data-template-editor-dirty]')?.textContent ?? null
    );
    document.querySelector('[data-template-editor-save]').click();
    await sleep(200);
    const saved = await api.readTemplateFile(importedId, 'kit.html');
    check(
      'Save writes the text into the package',
      saved.includes('probe saved this') &&
        (document.querySelector('[data-template-editor-dirty]')?.textContent ?? '') === '',
      { dirty: document.querySelector('[data-template-editor-dirty]')?.textContent, saved }
    );
    document.querySelector('[data-template-editor-validate]').click();
    await until(
      () => (document.querySelector('[data-template-editor-status]')?.textContent ?? '').includes('pandoc converted'),
      100
    );
    check(
      'Validate reports pandoc’s own answer',
      (document.querySelector('[data-template-editor-status]')?.textContent ?? '').includes('pandoc converted'),
      document.querySelector('[data-template-editor-status]')?.textContent ?? null
    );
    document.querySelector('[data-template-editor-close]').click();
    await sleep(150);
    document.querySelector('[data-template-use]').click();
    await sleep(200);
    const remembered = configManager.get()?.export_templates?.html ?? null;
    check(
      'Use this template remembers it for the kind and the card says which package it is',
      remembered === importedId &&
        (document.querySelector('[data-export-template]')?.textContent ?? '').includes(name),
      { remembered, shown: document.querySelector('[data-export-template]')?.textContent }
    );

    // The defaults file opens in the same code panel, and no template becomes a document.
    document.querySelector('[data-export-open-config]').click();
    await until(
      () =>
        visible('[data-template-editor]') &&
        document.querySelector('[data-template-file="export.html.yaml"]') !== null &&
        document.querySelector('[data-template-editor] .cm-editor') !== null
    );
    check(
      'Edit defaults opens the kind’s YAML in the code panel',
      (document.querySelector('[data-template-editor-title]')?.textContent ?? '').includes('HTML') &&
        document.querySelector('[data-template-file="export.html.yaml"]') !== null &&
        document.querySelector('[data-template-editor] .cm-editor') !== null,
      {
        title: document.querySelector('[data-template-editor-title]')?.textContent,
        file: document.querySelector('[data-template-file="export.html.yaml"]') !== null
      }
    );
    document.querySelector('[data-template-editor-close]').click();
    await sleep(120);
    check(
      'and no package or defaults file entered the session stack',
      session.documentSession.stack().length === stackBefore,
      { stack: session.documentSession.stack().length }
    );
    document.querySelector('[data-export-cancel]').click();
  } finally {
    for (const id of [importedId, incompatibleId]) {
      if (id === null) {
        continue;
      }
      try {
        await api.removeTemplate(id);
      } catch {
        // A package the probe never got as far as making.
      }
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
