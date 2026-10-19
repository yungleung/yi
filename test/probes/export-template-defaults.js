/**
 * Pandoc's own template and reference document become the same package shape as an import, and
 * validation speaks pandoc's words — including naming an entry the reader removed.
 *
 * Every package this probe makes is removed again, and the config is put back.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const files = await t.app('/src/api/files.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const stamp = Date.now().toString(36);
  const checkout = window.__probePaths.checkout;
  const made = [];
  const before = await invoke('get_config');
  try {
    const text = await api.createDefaultTemplate(
      'html',
      `Probe pandoc html ${stamp}`,
      'https://pandoc.org/MANUAL.html',
      null
    );
    made.push(text.id);
    const textEntry = await api.readTemplateFile(text.id, 'template.html');
    check(
      'a text kind is generated from pandoc’s default template and marked as such',
      text.manifest?.mode === 'template' &&
        text.manifest.kind === 'html' &&
        text.manifest.origin.type === 'pandoc-default' &&
        text.manifest.template === 'template.html' &&
        textEntry.includes('$body$'),
      { manifest: text.manifest, entry: textEntry.slice(0, 40) }
    );
    const valid = await api.validateTemplate(text.id);
    check(
      'and pandoc converts a test paragraph through it',
      valid.ok === true,
      valid
    );

    const reference = await api.createDefaultTemplate(
      'docx',
      `Probe pandoc docx ${stamp}`,
      null,
      null
    );
    made.push(reference.id);
    const named = reference.files.find((file) => file.name === 'template.docx');
    check(
      'a reference kind is generated from pandoc’s default reference document',
      reference.manifest?.mode === 'reference-doc' &&
        reference.manifest.reference_doc === 'template.docx' &&
        reference.manifest.template === null &&
        named !== undefined &&
        named.size > 1000,
      { manifest: reference.manifest, file: named }
    );

    const broken = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/broken-kit`,
      name: `Probe broken ${stamp}`,
      kind: 'latex',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(broken.id);
    const library = await api.exportTemplates();
    const summary = library.find((entry) => entry.id === broken.id);
    await files.deleteEntry(`${summary.path}/main.tex`);
    const missing = await api.validateTemplate(broken.id);
    check(
      'a validation of a package whose entry is gone names that file before pandoc runs',
      missing.ok === false && missing.message.includes('main.tex'),
      missing
    );
  } finally {
    for (const id of made.reverse()) {
      try {
        await api.removeTemplate(id);
      } catch {
        // A package a failed creation never made.
      }
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    const { configManager } = await t.app('/src/services/config_manager.ts');
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
