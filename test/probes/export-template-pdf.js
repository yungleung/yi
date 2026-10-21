/**
 * A PDF package's class file is found by the engine because the package folder is the working
 * directory, and the explicit test reports the engine's own answer.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const stamp = Date.now().toString(36);
  const before = await invoke('get_config');
  let made = null;
  try {
    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/latex-kit`,
      name: `Probe pdf engine ${stamp}`,
      kind: 'pdf',
      entry: 'main.tex',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made = pkg.id;
    check(
      'a LaTeX kit can be a PDF package, with its class beside the entry',
      pkg.manifest?.kind === 'pdf' && pkg.manifest.assets.includes('journal.cls'),
      pkg.manifest
    );
    const result = await api.testTemplatePdf(pkg.id);
    check(
      'Test PDF runs the engine with the package as its working directory',
      result.ok === true,
      result
    );
  } finally {
    if (made !== null) {
      try {
        await api.removeTemplate(made);
      } catch {
        // A package the probe never made.
      }
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
