/**
 * HTML without self-contained packaging keeps the template's files and the note's local pictures.
 *
 * The template uses Yuki's folder spelling (`template/css/…`); the note uses one local PNG and one
 * web PNG. The template tree is copied beside the page, the local picture moves into
 * `note.assets/`, and the web picture stays the URL the note wrote.
 *
 * @needs-http-fixture
 */
(async () => {
  const t = window.__t;
  const api = await t.app('/src/api/templates.ts');
  const exportApi = await t.app('/src/api/export.ts');
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const until = async (ready, tries = 120) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(50);
    }
    return false;
  };
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-html-assets-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note`;
  const pagePath = `${target}/note.html`;
  const checkout = window.__probePaths.checkout;
  const before = await invoke('get_config');
  let made = [];
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg=='
    ),
    (character) => character.charCodeAt(0)
  );
  const writeBytes = async (path, bytes) =>
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', bytes, {
      headers: { path: encodeURIComponent(path) }
    });
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
  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => card() !== null && !card().classList.contains('hidden');
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    let opened = false;
    void pending.then(() => {
      opened = true;
    });
    for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
      const prompt = document.querySelector('[data-prompt]');
      if (prompt !== null && !prompt.classList.contains('hidden')) {
        prompt.querySelector('[data-prompt-no]')?.click();
        break;
      }
      await sleep(50);
    }
    await Promise.race([pending, sleep(2000)]);
    await sleep(200);
  };
  try {
    await files.createEntry(home, folderName, false);
    await writeBytes(`${folder}/local.png`, png);
    const web = `${window.__probeHttpBase}/image.png`;
    const note = `# Assets\n\n![local](local.png) and ![web](${web}).\n`;
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/asset-kit/template`,
      name: `Probe html assets ${Date.now().toString(36)}`,
      kind: 'html',
      entry: 'page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    made.push(pkg.id);
    await configManager.update({
      export_templates: { ...(configManager.get()?.export_templates ?? {}), html: pkg.id }
    });

    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    await until(() => open());
    check(
      'Self-contained HTML starts off and the target is a bundle folder',
      document.querySelector('[data-export-self-contained]')?.checked === false &&
        document.querySelector('[data-export-target]')?.value === target,
      {
        checked: document.querySelector('[data-export-self-contained]')?.checked,
        target: document.querySelector('[data-export-target]')?.value
      }
    );
    const hints = t.hintsNow();
    document.querySelector('[data-export-target]').value = target;
    document.querySelector('[data-export-run]').click();
    const written = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const page = written ? await readText(pagePath) : '';
    check(
      'the local note picture is copied beside the page and linked relatively',
      page.includes('src="note.assets/local.png"') &&
        (await exists(`${target}/note.assets/local.png`)) &&
        !page.includes(`${folder}/local.png`),
      {
        local: page.includes('src="note.assets/local.png"'),
        copied: await exists(`${target}/note.assets/local.png`)
      }
    );
    check(
      'the web picture stays the URL the note wrote, not a temporary file',
      page.includes(`src="${web}"`) && !page.includes('/export/tmp/remote/'),
      { web, temporary: page.includes('/export/tmp/remote/') }
    );
    check(
      'the template’s CSS, JavaScript, image and folder spelling are delivered beside the page',
      page.includes('href="template/css/site.css"') &&
        page.includes('src="template/js/site.js"') &&
        (await exists(`${target}/template/css/site.css`)) &&
        (await exists(`${target}/template/js/site.js`)) &&
        (await exists(`${target}/template/img/logo.svg`)),
      {
        css: await exists(`${target}/template/css/site.css`),
        js: await exists(`${target}/template/js/site.js`),
        image: await exists(`${target}/template/img/logo.svg`)
      }
    );
    document.querySelector('[data-export-cancel]')?.click();
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
    await configManager.load();
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).length };
})()
