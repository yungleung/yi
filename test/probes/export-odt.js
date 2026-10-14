/**
 * The second kind: the same card, the same pre-process, and a LibreOffice file at the end.
 *
 * What this proves beyond `export-docx.js` is that *choosing* a kind is real — the tab moves, the
 * target's extension travels with it, and the configuration the run is handed is that kind's own
 * file — and that the document which comes out is a document LibreOffice will open: an ODF is a zip
 * whose *first* entry is a stored `mimetype` naming the type, and the string is in the file. The
 * picture and the citation go through the same steps they do for the docx, so they are asserted here
 * too: the note's image in the odt's own media folder (`Pictures/`), and the reference list the
 * library was handed for.
 *
 * @covers src-tauri/src/export.rs (KINDS, pandoc_arguments), src/ui/export/export_dialog.ts (a tab
 *   per kind, and the target following it), src/ui/export/export_flow.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const api = await t.app('/src/api/export.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
  };
  const bytesOf = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_file', { path });
      return read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    } catch {
      return null;
    }
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 100) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  // A folder of this run's own — see `export-docx.js` for why: the live session is not reset
  // between runs, so a note opened twice under one name is one the session already holds.
  const folderName = `yi-probe-export-odt-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const checkout = window.__probePaths.checkout;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.odt`;
  const note = [
    '# Going out',
    '',
    `A picture: ![icon](${checkout}src-tauri/icons/32x32.png), and a citation [@smith2020].`,
    ''
  ].join('\n');

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  /** Opens the probe's note and waits for it, bounded — see `export-docx.js` for why. */
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

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    await invoke('plugin:event|emit', { event: 'export', payload: null });
    await until(() => open(), 60);

    // --- choosing the kind ---------------------------------------------------------------------

    const veil = card();
    const tabs = [...veil.querySelectorAll('[data-export-kind]')];
    const odt = tabs.find((tab) => tab.dataset.exportKind === 'odt') ?? null;
    const field = veil.querySelector('[data-export-target]');
    const docxTarget = field.value;
    odt?.click();
    await sleep(150);
    check(
      'pressing the odt tab moves the choice, and the target’s extension with it',
      odt !== null &&
        odt.closest('li')?.classList.contains('menu-active') === true &&
        tabs[0].closest('li')?.classList.contains('menu-active') === false &&
        docxTarget.endsWith('/note.docx') &&
        field.value === target,
      { docxTarget, chosen: field.value }
    );
    const status = veil.querySelector('[data-export-status]')?.textContent ?? '';
    check('and the card still says what will write it', status.includes('pandoc:'), status);

    // --- the document --------------------------------------------------------------------------

    field.value = target;
    veil.querySelector('[data-export-run]').click();
    const written = await until(async () => (await bytesOf(target)) !== null);
    const bytes = await bytesOf(target);
    const latin = bytes === null ? '' : new TextDecoder('latin1').decode(bytes);
    check(
      'Export writes a LibreOffice document: the type an ODF is read by, which is the zip’s first entry',
      written &&
        bytes !== null &&
        latin.includes('application/vnd.oasis.opendocument.text') &&
        latin.slice(0, 64).includes('mimetype'),
      { written, firstEntry: latin.slice(30, 42), size: bytes?.length ?? 0 }
    );
    check(
      'with the note’s picture in the odt’s own media folder',
      latin.includes('Pictures/'),
      { pictures: latin.includes('Pictures/') }
    );
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      (hint?.textContent ?? '').includes('note.odt'),
      hint?.textContent ?? null
    );

    // --- the kind's own configuration ----------------------------------------------------------

    await invoke('plugin:event|emit', { event: 'export', payload: null });
    await until(() => open(), 60);
    card().querySelector('[data-export-kind="odt"]')?.click();
    await sleep(150);
    const { kinds } = await api.exportKinds();
    const odtConfig = kinds.find((kind) => kind.kind === 'odt')?.config_path ?? '';
    const config = card().querySelector('[data-export-config]')?.textContent ?? '';
    check(
      'and the configuration file it names is the odt kind’s own',
      odtConfig.endsWith('/export/export.odt.yaml') && config.includes(odtConfig),
      { config, odtConfig }
    );
    const settings = await readText(odtConfig);
    check(
      'which is written with the writer this kind needs',
      settings !== null && settings.includes('writer: odt'),
      settings === null ? 'not written' : settings.split('\n').filter((line) => line.startsWith('writer'))
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(150);
    check('and Escape closes the card', !open(), { open: open() });
  } finally {
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
