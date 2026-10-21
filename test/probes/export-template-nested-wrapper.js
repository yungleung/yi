/**
 * A complete document in a subfolder wraps beside itself, escapes its literal dollars and can be
 * replaced by another complete sample through the details form.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const stamp = Date.now().toString(36);
  let made = null;
  try {
    const imported = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/nested-kit`,
      name: `Nested wrapper ${stamp}`,
      kind: 'latex',
      entry: 'samples/main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made = imported.id;
    const template = await api.readTemplateFile(imported.id, 'samples/template.tex');
    check(
      'a nested document wraps beside itself and escapes literal dollars',
      imported.manifest?.mode === 'wrapper' &&
        imported.manifest.template === 'samples/template.tex' &&
        imported.manifest.assets.includes('samples/source.tex') &&
        template.includes('$$\\pi$$') &&
        template.includes('$body$'),
      { manifest: imported.manifest, template: template.split('\n').slice(0, 8) }
    );

    const updated = await api.updateTemplate(imported.id, {
      name: `Nested wrapper ${stamp} other`,
      kind: 'latex',
      source: null,
      license: null,
      entry: 'samples/other.tex'
    });
    const otherTemplate = await api.readTemplateFile(imported.id, 'samples/template.tex');
    check(
      'choosing another complete sample keeps the wrapper beside the samples',
      updated.manifest?.mode === 'wrapper' &&
        updated.manifest.template === 'samples/template.tex' &&
        updated.manifest.assets.includes('samples/other.tex') &&
        updated.manifest.assets.includes('samples/source.tex') &&
        otherTemplate.includes('$$\\alpha$$') &&
        otherTemplate.includes('$body$'),
      { manifest: updated.manifest, template: otherTemplate.split('\n').slice(0, 8) }
    );
  } finally {
    if (made !== null) {
      try {
        await api.removeTemplate(made);
      } catch {}
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
