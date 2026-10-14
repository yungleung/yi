/**
 * What the app asks pandoc to do, watched by a pandoc that only records.
 *
 * The app's whole hand is one call — `pandoc --defaults <the kind's own file> --output <where>
 * --resource-path <the note's folders> --bibliography <the library> --csl <the style> <the note>` —
 * and the note it hands over is the text *after* the export's pre-process: every wikilink written as
 * the words it renders as, every image's destination written as the file it names. Proving all of it
 * from the outside means a pandoc that records instead of converting (`test/probes/fake-pandoc.sh`,
 * committed, since a probe cannot set an executable bit), pointed at through the app's own seam
 * (`export_use_pandoc`), which the harness puts back before every probe.
 *
 * The recorder keeps the note it was given as well as the arguments, so the two halves of one
 * question are answered at once: *what* the app asked for, and *what it was working from*. It also
 * shows what the app does with its own scratch: the note it wrote under the app's data folder is
 * deleted again, whatever pandoc said — the refusing hand of that is `export-refused.js`.
 *
 * @covers src-tauri/src/export.rs (run_pandoc, write_note, export_through_pandoc),
 *   src/ui/export/preprocess.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const api = await t.app('/src/api/export.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
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
  const folderName = `yi-probe-export-arguments-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const recorder = `${home}/yi-probe-fake-pandoc`;
  const notePath = `${folder}/note.md`;
  const otherPath = `${folder}/other.md`;
  const target = `${folder}/out.docx`;
  const checkout = window.__probePaths.checkout;
  const library = `${checkout}test/fixtures/workspace/zotero.bib`;
  const note = [
    '# Going out',
    '',
    'An alias: [[other|an alias]], and a bare one: [[other]].',
    '',
    `A citation [@smith2020], and a picture: ![icon](${checkout}src-tauri/icons/icon.png).`,
    '',
    '```md',
    '[[still code]]',
    '```',
    ''
  ].join('\n');

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: null });
    return await until(() => open(), 60);
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
    await files.createEntry(folder, 'other.md', true);
    await files.writeTextAtomically(otherPath, '---\ntitle: The Other Note\n---\n\n# other\n');
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    // The library the app hands pandoc is the one its settings name, so this probe names one it can
    // rely on — the fixtures' own — and puts the reader's back in `finally`.
    await configManager.update({ bibliography_file: library });
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    await api.pointAtPandoc(`${window.__probePaths.checkout}test/probes/fake-pandoc.sh`);
    const { kinds } = await api.exportKinds();
    const config = kinds[0].config_path;

    check('the app asks for the export card', await askForExport(), { open: open() });
    // A hint from an earlier export waits in the corner until the next press, and a programmatic
    // click is not one: this run's hint is what the last check reads, so the corner is cleared.
    // A hint from an earlier run waits in the corner until the next press, and a programmatic
    // click is not one: the corner is cleared before this run's own hint is read.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(100);
    document.querySelector('[data-export-target]').value = target;
    document.querySelector('[data-export-run]').click();

    const written = await until(() => exists(target));
    const lines = (await readText(`${recorder}/argv.log`)).trim().split('\n');
    const asked = lines.slice(1);
    const scratch = asked.at(-1) ?? '';
    // The style pandoc was handed, read out of the call itself rather than guessed at.
    const csl = asked[11] ?? '';
    const parts = {
      written,
      program: lines[0],
      defaults: asked[0] === '--defaults' && asked[1] === config,
      output: asked[2] === '--output' && asked[3] === target,
      resources: asked[4] === '--resource-path' && asked[5].split(':')[0] === folder,
      library: asked.slice(6, 8).join(' ') === `--bibliography ${library}`,
      heading: asked[8] === '--metadata' && asked[9] === 'reference-section-title=References',
      style: asked[10] === '--csl' && csl.endsWith('/export/styles/apa.csl'),
      note:
        scratch.startsWith(`${config.slice(0, config.lastIndexOf('/'))}/`) &&
        scratch.endsWith('.md')
    };
    check(
      'the app asks pandoc for the kind’s own defaults file, the output, the folders a destination resolves against, the library, the heading and the style the citations came from, and the note',
      Object.values(parts).every(Boolean),
      parts
    );
    check(
      'and the style the reader’s citations are formatted in is a CSL file pandoc can read',
      (await readText(csl)).includes('<style'),
      { csl }
    );
    check(
      'and it is pandoc’s, not the app’s: the file pandoc wrote is a copy of what it was handed',
      (await readText(target)) === (await readText(`${recorder}/input.md`)),
      { first: (await readText(target)).split('\n')[0] }
    );

    // --- the note pandoc was handed: the pre-process, seen from the other side ------------------

    const prepared = await readText(`${recorder}/input.md`);
    check(
      'the note pandoc is handed is the note on screen',
      prepared.startsWith('# Going out'),
      prepared.split('\n').slice(0, 1)
    );
    check(
      'with the a wikilink written as the words it renders as — its own title, and the title of the note it names',
      prepared.includes('An alias: an alias, and a bare one: The Other Note.'),
      prepared.split('\n')[2]
    );
    check(
      'and a wikilink that is a fence’s body left exactly as it was written',
      prepared.includes('[[still code]]'),
      prepared.includes('[[still code]]')
    );
    check(
      'and an image’s destination written as the file it names, so pandoc embeds what the page showed',
      prepared.includes(`![icon](${checkout}src-tauri/icons/icon.png)`),
      prepared.split('\n').find((line) => line.startsWith('A citation'))?.trim()
    );

    // --- the app's own scratch -----------------------------------------------------------------

    check(
      'the note the app wrote for pandoc is deleted again once the call is over',
      !(await exists(scratch)),
      { scratch, stillThere: await exists(scratch) }
    );
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told the file is there',
      (hint?.textContent ?? '').includes('out.docx'),
      hint?.textContent ?? null
    );

    // --- what a kind that carries its own name is told -------------------------------------------

    // The window hands over the note's own name and language whatever the kind is; the *kind's row*
    // decides whether it uses them. A book does (its title page and its required `dc:title` and
    // `dc:language`), a docx does not (measured: with a title in the metadata, a docx of a note that
    // opens with its own heading says that name twice), and this is that decision seen from outside.
    const i18n = await t.app('/src/services/i18n.ts');
    const epubTarget = `${folder}/out.epub`;
    await askForExport();
    document.querySelector('[data-export-tab="epub"]').click();
    await sleep(150);
    document.querySelector('[data-export-target]').value = epubTarget;
    document.querySelector('[data-export-run]').click();
    await until(() => exists(epubTarget));

    const calls = (await readText(`${recorder}/argv.log`))
      .trim()
      .split(/\npandoc\n/)
      .map((call) => call.replace(/^pandoc\n/, '').split('\n'));
    const docxCall = calls[0] ?? [];
    const epubCall = calls[1] ?? [];
    check(
      'a docx is not told what the note is called, because its own body says it',
      docxCall.length > 0 &&
        !docxCall.some((argument) => argument.startsWith('title=')) &&
        !docxCall.some((argument) => argument.startsWith('lang=')),
      { docx: docxCall }
    );
    check(
      'and an epub is: the note’s own name (here its heading) and the language the app speaks',
      epubCall.includes('--metadata') &&
        epubCall.includes('title=Going out') &&
        epubCall.includes(`lang=${i18n.language()}`),
      { epub: epubCall, language: i18n.language() }
    );
  } finally {
    await api.pointAtPandoc(null);
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
