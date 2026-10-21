/**
 * YAML frontmatter reaches a package template, while a fixed template asset keeps its own path.
 *
 * The cover is `$cover$` from the note's metadata; the seal is the literal `img/seal.svg`. Yuki's
 * JavaScript makes an empty cover look like the seal points at the page itself, so this probe keeps
 * both sources distinct and also checks the two files travel in the bundle.
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const files = await t.app('/src/api/files.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const checkout = window.__probePaths.checkout;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const stamp = Date.now().toString(36);
  const folderName = `yi-probe-template-metadata-${stamp}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note`;
  const pagePath = `${target}/note.html`;
  const before = await invoke('get_config');
  const made = [];
  const readText = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  try {
    await files.createEntry(home, folderName, false);
    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/metadata-kit/template`,
      name: `Probe metadata ${stamp}`,
      kind: 'html',
      entry: 'page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(pkg.id);
    const text =
      '---\ntitle: A cover\nauthor: A reader\ncover: img/cover.svg\n---\n\n# A cover\n\nBody.\n';
    await exportApi.runExport({
      kind: 'html',
      text,
      output_path: target,
      resource_paths: [],
      source_dir: null,
      bibliography: null,
      csl: null,
      references: null,
      title: 'A cover',
      language: 'en',
      paper: null,
      landscape: null,
      suppress_references: false,
      template_id: pkg.id,
      self_contained: false
    });
    const page = await readText(pagePath);
    check(
      'the cover comes from YAML metadata and the seal keeps its literal template path',
      page.includes('<img id="cover" src="img/cover.svg" alt="cover">') &&
        page.includes('<img id="seal" src="img/seal.svg" alt="seal">'),
      {
        cover: /<img id="cover"[^>]*>/.exec(page)?.[0] ?? null,
        seal: /<img id="seal"[^>]*>/.exec(page)?.[0] ?? null
      }
    );
    check(
      'both pictures travel inside the bundle',
      (await exists(`${target}/img/cover.svg`)) &&
        (await exists(`${target}/img/seal.svg`)),
      {
        cover: await exists(`${target}/img/cover.svg`),
        seal: await exists(`${target}/img/seal.svg`)
      }
    );
  } finally {
    for (const id of made.reverse()) {
      try {
        await api.removeTemplate(id);
      } catch {
        // A package a failed import never made.
      }
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // The folder a run never made.
    }
    await invoke('set_config', {
      cfg: { ...before, config_version: await invoke('get_current_config_version') }
    });
    const { configManager } = await t.app('/src/services/config_manager.ts');
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
