/**
 * What the app asks pandoc to do, watched by a pandoc that only records.
 *
 * The app's whole hand is one call — `pandoc --defaults <the kind's own file> --output <where>
 * --resource-path <the note's folders> <the note>` — and the note it hands over is the text *after*
 * the export's pre-process: every wikilink written as the words it renders as. Proving both from
 * the outside means a pandoc that records instead of converting (`test/probes/fake-pandoc.sh`,
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
  const folder = `${home}/yi-probe-export-arguments`;
  const recorder = `${home}/yi-probe-fake-pandoc`;
  const notePath = `${folder}/note.md`;
  const otherPath = `${folder}/other.md`;
  const target = `${folder}/out.docx`;
  const note = [
    '# Going out',
    '',
    'An alias: [[other|an alias]], and a bare one: [[other]].',
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
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await sleep(150);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
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
    await files.createEntry(home, 'yi-probe-export-arguments', false);
    await files.createEntry(folder, 'note.md', true);
    await files.createEntry(folder, 'other.md', true);
    await files.writeTextAtomically(otherPath, '---\ntitle: The Other Note\n---\n\n# other\n');
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

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
    const scratch = asked[6] ?? '';
    const parts = {
      written,
      program: lines[0],
      count: asked.length,
      defaults: asked[0] === '--defaults' && asked[1] === config,
      output: asked[2] === '--output' && asked[3] === target,
      resources: asked[4] === '--resource-path' && asked[5].split(':')[0] === folder,
      note:
        scratch.startsWith(`${config.slice(0, config.lastIndexOf('/'))}/`) &&
        scratch.endsWith('.md')
    };
    check(
      'the app asks pandoc for the kind’s own defaults file, the output, the folders a destination resolves against, and the note',
      Object.values(parts).every(Boolean),
      parts
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
