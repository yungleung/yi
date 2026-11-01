/**
 * A picture the note names on the web, fetched by the app itself.
 *
 * The local HTTP fixture answers a redirect to a real PNG, so this proves the in-process fetch
 * follows a redirect, names the file from the response's content type, hands pandoc a local file,
 * and leaves no fetched copy behind. Nothing leaves the machine.
 *
 * @needs-http-fixture
 * @covers src-tauri/src/export/pictures.rs (download_image, image_extension, export_fetch_image),
 *   src/ui/export/preprocess.ts (the remote rule), src/ui/export/export_flow.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const bytesOf = async (file) => {
    try {
      const read = await invoke('plugin:fs|read_file', { path: file });
      return read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    } catch {
      return null;
    }
  };
  const exists = async (file) => {
    try {
      return await invoke('plugin:fs|exists', { path: file });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 120) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) return true;
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-web-image-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const target = `${folder}/note.docx`;
  const url = `${window.__probeHttpBase}/redirect`;
  const note = ['# A picture from the web', '', `![A sample image](${url})`, ''].join('\n');
  const appData = await invoke('plugin:path|resolve_directory', { directory: 14 });
  const remote = await invoke('plugin:path|join', {
    paths: [appData, 'export', 'tmp', 'remote']
  });

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const show = async (file, content) => {
    const pending = session.documentSession.openFile({ path: file, content });
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
  const exportTo = async (kind, file) => {
    const hints = t.hintsNow();
    await invoke('plugin:event|emit', { event: 'export', payload: kind });
    await until(() => open(), 60);
    await sleep(150);
    card().querySelector('[data-export-target]').value = file;
    card().querySelector('[data-export-run]').click();
    return await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
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
    await files.writeTextAtomically(`${folder}/note.md`, note);
    await t.openWorkspace(folder);
    await show(`${folder}/note.md`, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('A picture from the web'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    const wrote = await exportTo('docx', target);
    const bytes = wrote ? await bytesOf(target) : null;
    const latin = bytes === null ? '' : new TextDecoder('latin1').decode(bytes);
    check(
      'the app fetches the redirected picture and hands pandoc a local file',
      wrote && bytes !== null && latin.includes('word/media/'),
      { wrote, media: latin.includes('word/media/'), size: bytes?.length ?? 0 }
    );
    check(
      'and the copy fetched for that run is gone once the run is over',
      !(await exists(remote)),
      { remote, stillThere: await exists(remote) }
    );
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
