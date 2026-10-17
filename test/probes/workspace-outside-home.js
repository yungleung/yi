/**
 * A workspace outside the home folder: read, written and painted.
 *
 * The file plugin and the asset protocol start scoped to the home folder
 * (`src-tauri/capabilities/default.json`, `tauri.conf.json`), and that is a scope about the *app's*
 * files rather than the reader's: outside it a folder can be listed, rearranged and deleted by the
 * app's own commands — they carry no scope — while the page cannot read a note in it (*"forbidden path:
 * … maybe it is not allowed on the scope for `allow-read-text-file`"*, measured while this item was
 * written) and an inserted picture cannot be written there at all. So the folders the app is *working
 * in* are granted at run time (`src-tauri/src/access.rs`): the ones the config names where the config is
 * read, and a document's own before the session reads it.
 *
 * Everything here happens under `/private/tmp`, which is outside the home folder by construction, and
 * the probe takes the measurement first — a folder nothing has been asked about is refused — so that
 * what the fix changes is visible in one run. The last check is the half that must not change: a
 * folder nobody asked about stays refused however many others were granted.
 *
 * @covers src-tauri/src/access.rs, src/api/files.ts (grantFolder), src/services/session.ts (load,
 *   openPath)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const invoke = (command, args, options) =>
    window.__TAURI_INTERNALS__.invoke(command, args, options);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
  };
  /** The plugin's own two writes, headers and all — what a note's save and an inserted picture make. */
  const writeTextThroughThePage = async (path, text) =>
    await invoke('plugin:fs|write_text_file', new TextEncoder().encode(text), {
      headers: { path: encodeURIComponent(path) }
    });
  const writeBytesThroughThePage = async (path, bytes) =>
    await invoke('plugin:fs|write_file', bytes, {
      headers: { path: encodeURIComponent(path) }
    });
  const refused = async (work) => {
    try {
      await work();
      return null;
    } catch (error) {
      return String(error);
    }
  };

  const run = Date.now().toString(36);
  const outside = `/private/tmp/yi-probe-outside-${run}`;
  const untaken = `/private/tmp/yi-probe-untaken-${run}`;
  const pictures = `/private/tmp/yi-probe-pictures-${run}`;
  const notePath = `${outside}/note.md`;
  const shotPath = `${outside}/shot.png`;
  const elsewhere = `${untaken}/note.md`;
  const storedPicture = `${pictures}/shot.png`;
  // A 1x1 png, so the picture a note names is one the page can paint.
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAE/wH/1c1lAAAAAElFTkSuQmCC'
    ),
    (character) => character.charCodeAt(0)
  );
  const note = '# Going out\n\nA picture: ![shot](shot.png)\n';

  const before = await invoke('get_config');
  try {
    // The folders are made by the app's own commands, which carry no scope of their own.
    for (const [parent, name] of [
      ['/private/tmp', `yi-probe-outside-${run}`],
      ['/private/tmp', `yi-probe-untaken-${run}`],
      ['/private/tmp', `yi-probe-pictures-${run}`]
    ]) {
      await files.createEntry(parent, name, false);
    }
    await files.createEntry(outside, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await files.createEntry(untaken, 'note.md', true);
    await files.writeTextAtomically(elsewhere, '# Elsewhere\n\nSome text.\n');

    // --- the measurement, before anything is granted ------------------------------------------

    const refusedNote = await refused(() => readText(elsewhere));
    check(
      'a folder the app was never asked to work in is refused to the page',
      refusedNote !== null && refusedNote.includes('forbidden path'),
      { error: refusedNote }
    );

    // --- a document's own folder: the session grants what it is about to read ------------------

    let opened = false;
    const pending = session.documentSession.openPath(elsewhere);
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
    check(
      'and a note the session opens outside the workspace is read, folder and all',
      opened && (await readText(elsewhere)).startsWith('# Elsewhere'),
      { opened, read: (await readText(elsewhere)).slice(0, 20) }
    );

    // --- the workspace: read, written and painted -----------------------------------------------

    await t.openWorkspace(outside);
    check(
      'a workspace outside the home folder is read through the page',
      (await readText(notePath)).startsWith('# Going out'),
      { read: (await readText(notePath)).slice(0, 24) }
    );
    await writeBytesThroughThePage(shotPath, png);
    check(
      'a picture the page writes into it is there, byte for byte',
      (await invoke('plugin:fs|read_file', { path: shotPath })).byteLength === png.byteLength,
      { wrote: png.byteLength }
    );

    // The note is opened through the app, so the picture in it is drawn by the asset protocol: the one
    // path outside the home folder that has no command of its own.
    const openedNote = session.documentSession.openPath(notePath);
    await Promise.race([openedNote, sleep(2000)]);
    await sleep(400);
    const drawn = [...document.querySelectorAll('.prose img')];
    check(
      'and the picture in that note is painted, served by the asset protocol',
      drawn.length > 0 && drawn.some((image) => image.naturalWidth > 0),
      {
        images: drawn.length,
        sizes: drawn.map((image) => [image.naturalWidth, image.naturalHeight]),
        src: drawn[0]?.getAttribute('src') ?? null
      }
    );

    // --- the pictures folder the settings name, which is a third grant --------------------------

    await configManager.update({ image_folder: pictures });
    await writeBytesThroughThePage(storedPicture, png);
    check(
      'and the pictures folder the settings name is writable by the page too',
      (await invoke('plugin:fs|read_file', { path: storedPicture })).byteLength === png.byteLength,
      { folder: pictures }
    );

    // --- and nothing else was opened up ---------------------------------------------------------

    await files.createEntry('/private/tmp', `yi-probe-elsewhere-${run}`, false);
    await files.createEntry(`/private/tmp/yi-probe-elsewhere-${run}`, 'note.md', true);
    const stranger = `/private/tmp/yi-probe-elsewhere-${run}`;
    const stillRefused = await refused(() => readText(`${stranger}/note.md`));
    const refusedWrite = await refused(() =>
      writeTextThroughThePage(`${stranger}/nothing.md`, 'no')
    );
    check(
      'while a folder nobody asked about is still refused',
      stillRefused !== null && stillRefused.includes('forbidden path'),
      { error: stillRefused }
    );
    check(
      'and so is a write there',
      refusedWrite !== null && refusedWrite.includes('forbidden path'),
      { error: refusedWrite }
    );
  } finally {
    await configManager.save(before);
    for (const folder of [outside, untaken, pictures, `/private/tmp/yi-probe-elsewhere-${run}`]) {
      try {
        await files.deleteEntry(folder);
      } catch {
        // Nothing to tidy.
      }
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
