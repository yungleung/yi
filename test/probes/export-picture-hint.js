/**
 * A picture that is not one: the card says so before the export, in the app's own words.
 *
 * A note may write an image whose destination is a `data:` URL of something that is not an image, and
 * the failure is silent where it hurts most — measured, pandoc carries such a destination into a docx
 * as `word/media/rId10.txt` and says nothing, and a pdf gets pandoc's own complaint about a temporary
 * path (`Cannot load file`, `Jpeg Invalid marker used`). So the card names the destination itself
 * (`ui/export/assets/picture_hint.ts` reads the parse for it), and this is that line through the running app:
 * a card for a note whose destination is text has it, a card for a note whose destination is a picture
 * does not, and no export has to run for either.
 *
 * @covers src/ui/export/assets/picture_hint.ts, src/ui/export/dialog/index.ts (the line),
 *   src/ui/export/workflow/index.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
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
  const folderName = `yi-probe-picture-hint-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const textNote = `${folder}/text.md`;
  const pictureNote = `${folder}/picture.md`;
  // A 1x1 png, so the second note's destination is a picture of the kind every export carries.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAE/wH/1c1lAAAAAElFTkSuQmCC';
  const notAPicture = 'data:text/plain;base64,aGVsbG8=';
  const textNoteBody = `# Going out\n\nNot a picture: ![x](${notAPicture})\n`;
  const pictureNoteBody = `# Going out\n\nA picture: ![x](${png})\n`;

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  /** Opens the note and waits for it, bounded — see `export-docx.js` for why. */
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
  const askForDocx = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'docx' });
    await until(() => open(), 60);
    await sleep(120);
    return card();
  };

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'text.md', true);
    await files.createEntry(folder, 'picture.md', true);
    await files.writeTextAtomically(textNote, textNoteBody);
    await files.writeTextAtomically(pictureNote, pictureNoteBody);
    await t.openWorkspace(folder);

    await show(textNote, textNoteBody);
    const withText = await askForDocx();
    const line = withText.querySelector('[data-export-not-pictures]');
    check(
      'a destination that names no image is said on the card, naming the destination',
      line !== null &&
        !line.classList.contains('hidden') &&
        (line.textContent ?? '').includes(notAPicture),
      { hidden: line?.classList.contains('hidden') ?? null, said: line?.textContent ?? null }
    );
    await withText.querySelector('[data-export-cancel]')?.click();
    await sleep(120);

    await show(pictureNote, pictureNoteBody);
    const withPicture = await askForDocx();
    const quiet = withPicture.querySelector('[data-export-not-pictures]');
    check(
      'and a destination that is a picture is not said at all',
      quiet !== null && quiet.classList.contains('hidden'),
      { hidden: quiet?.classList.contains('hidden') ?? null, said: quiet?.textContent ?? null }
    );
    await withPicture.querySelector('[data-export-cancel]')?.click();
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
