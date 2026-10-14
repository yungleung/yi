/**
 * A picture the note names on the web, in the document the export writes.
 *
 * This is the case the demo document carries (`test/fixtures/workspace/default-document.md`:
 * `![A sample image](https://placehold.co/200x80/png)`), and pandoc cannot always fetch it: the
 * binary this was written against answers *"pandoc was compiled without HTTP support"* and puts the
 * picture's *description* in the document instead. So the app fetches it — through the system's
 * curl, pointed at a curl that only records (`test/probes/fake-curl.sh`) and answers with a real
 * PNG, which is what makes this provable without a network.
 *
 * What is proved: the app asks curl for the URL in the note with the flags it documents, hands
 * pandoc a *local file* instead of the URL, the document that comes out has a picture in it
 * (`word/media/`, read from the zip's own entry names), and the copy fetched for that run is gone
 * once the run is over.
 *
 * @covers src-tauri/src/export.rs (run_curl, download_image, image_extension, export_fetch_image),
 *   src/ui/export/preprocess.ts (the remote rule), src/ui/export/export_flow.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const api = await t.app('/src/api/export.ts');
  const session = await t.app('/src/services/session.ts');
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
  const until = async (ready, tries = 80) => {
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
  const folderName = `yi-probe-web-image-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const recorder = `${home}/yi-probe-fake-curl`;
  const target = `${folder}/default.docx`;
  const url = 'https://placehold.co/200x80/png';
  // The note the demo document is, image and all: the app has to fetch that URL itself.
  const note = ['# A picture from the web', '', `![A sample image](${url})`, ''].join('\n');

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
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // A folder a run the bridge cut off left behind.
      }
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
    await api.pointAtCurl(`${window.__probePaths.checkout}test/probes/fake-curl.sh`);

    await invoke('plugin:event|emit', { event: 'export', payload: null });
    await until(() => open(), 60);
    document.querySelector('[data-export-target]').value = target;
    document.querySelector('[data-export-run]').click();
    const written = await until(async () => (await bytesOf(target)) !== null, 120);

    // --- what the app asked for ---------------------------------------------------------------

    const lines = (await readText(`${recorder}/argv.log`)).trim().split('\n');
    const asked = lines.slice(1);
    // One argument per line (a path may hold a space), so the whole call can be written out and
    // compared: this *is* the list of what the app may ask curl for.
    const expected = [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '30',
      '--output',
      asked[7] ?? '',
      '--write-out',
      '%{content_type}',
      '--',
      url
    ];
    check(
      'the app asks curl for the note’s own URL: fail on a status that is not a document, follow a redirect, give up rather than hang, write the file, and say what the server called it',
      lines[0] === 'curl' &&
        asked.length === expected.length &&
        asked.join('\u0000') === expected.join('\u0000') &&
        asked[7].includes('/export/tmp/remote/') &&
        asked[7].endsWith('.download'),
      { asked }
    );

    // --- what came out -------------------------------------------------------------------------

    const bytes = await bytesOf(target);
    const latin = bytes === null ? '' : new TextDecoder('latin1').decode(bytes);
    check(
      'and the document has the picture in it rather than the description of one',
      written && latin.includes('word/media/'),
      { written, media: latin.includes('word/media/'), size: bytes?.length ?? 0 }
    );
    const remote = await (async () => {
      const dir = asked[7] ?? '';
      return dir.slice(0, dir.lastIndexOf('/'));
    })();
    check(
      'and the copy fetched for that run is gone once the run is over',
      remote !== '' && !(await exists(remote)),
      { remote, stillThere: await exists(remote) }
    );
  } finally {
    await api.pointAtCurl(null);
    for (const stale of [folder, recorder]) {
      try {
        await files.deleteEntry(stale);
      } catch {
        // Nothing to tidy.
      }
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
