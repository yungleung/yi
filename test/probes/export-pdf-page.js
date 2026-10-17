/**
 * The page a PDF is laid out on, as the card offers it: a size and an orientation, for the one kind
 * whose engine draws a page.
 *
 * Both fields open on *the settings file's own*, which is the page the reader set up there, so the
 * first export here asks for nothing and must come out exactly as it did before this card had the two
 * fields — A4 portrait, the shipped file's own answer. The second asks for letter, landscape, and the
 * page's own `/MediaBox` (read out of the file's streams, `lib.js: pdfPageSize`) has to be 792 x 612
 * points: the card's answer reaches the paper, and it reaches it *over* the file's `papersize: a4`.
 * That last part is why a size is passed as a `geometry` option rather than as a `papersize` variable:
 * measured by hand, a `papersize` on the command line is concatenated with the reader's own (`a4letter-
 * paper`, a LaTeX warning about an unused global option, and a letter page by luck), while geometry's
 * options are appended after the file's and take the page with them.
 *
 * The reader's file is read before and after: nothing on the card is allowed to be a way of editing it.
 *
 * Two `xelatex` runs, so it outruns the bridge's five seconds on its own and the harness reads the
 * result out of the page's stash (`export-pdf.js` says the same about one run, and there is nothing to
 * split it into: each overrun *is* one export).
 *
 * @covers src-tauri/src/export.rs (pandoc_arguments, PAPER_SIZES), src/ui/export/export_dialog.ts (the
 *   page row), test/probes/lib.js (pdfPageSize)
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

  const bytesOf = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_file', { path });
      return read instanceof ArrayBuffer ? new Uint8Array(read) : Uint8Array.from(read);
    } catch {
      return null;
    }
  };
  const readText = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_text_file', { path });
      return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
    } catch {
      return null;
    }
  };
  const until = async (ready, tries = 200) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-pdf-page-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const ownPage = `${folder}/own.pdf`;
  const askedPage = `${folder}/letter-landscape.pdf`;
  const note = '# Going out\n\nA short paragraph, and a citation [@smith2020].\n';

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
  /** Asks for a kind's export card, and answers with the card. */
  const askFor = async (kind) => {
    await invoke('plugin:event|emit', { event: 'export', payload: kind });
    await until(() => open(), 60);
    return card();
  };
  const exportTo = async (target) => {
    const hints = t.hintsNow();
    card().querySelector('[data-export-target]').value = target;
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
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show(notePath, note);

    const { kinds } = await api.exportKinds();
    const settingsPath = kinds.find((kind) => kind.kind === 'pdf')?.config_path ?? '';
    const settings = await readText(settingsPath);

    // --- what the card offers, and what it offers it for ----------------------------------------

    const docx = await askFor('docx');
    await sleep(100);
    const docxRow = docx.querySelector('[data-export-paper]')?.closest('div.mt-3');
    check(
      'a kind whose page is not the app’s to lay out is offered no page of its own',
      docxRow?.classList.contains('hidden') === true,
      { className: docxRow?.className ?? null }
    );
    await docx.querySelector('[data-export-cancel]')?.click();
    await sleep(100);

    const veil = await askFor('pdf');
    await sleep(150);
    const paper = veil.querySelector('[data-export-paper]');
    const orientation = veil.querySelector('[data-export-orientation]');
    const values = [...(paper?.options ?? [])].map((option) => option.value);
    check(
      'the pdf card offers a size and an orientation, both open on the settings file’s own',
      paper !== null &&
        orientation !== null &&
        paper.closest('div.mt-3')?.classList.contains('hidden') === false &&
        paper.value === '' &&
        orientation.value === '',
      { paper: paper?.value ?? null, orientation: orientation?.value ?? null }
    );
    check(
      'and the sizes on it are the app’s own list, with the one the settings file sets among them',
      values.includes('a4paper') && values.includes('letterpaper') && values.includes('b0j'),
      { count: values.length, first: values.slice(0, 4), letter: values.includes('letterpaper') }
    );

    // --- what an export that asks for nothing gets ----------------------------------------------

    check('and an export with both fields left alone is written', await exportTo(ownPage), {
      target: ownPage
    });
    const own = await t.pdfPageSize(await bytesOf(ownPage));
    check(
      'its page is the one the settings file sets: A4, portrait',
      own !== null && Math.abs(own.width - 595.28) < 1 && Math.abs(own.height - 841.89) < 1,
      { page: own }
    );

    // --- and what the reader’s own answer gets --------------------------------------------------

    const asked = await askFor('pdf');
    await sleep(150);
    asked.querySelector('[data-export-paper]').value = 'letterpaper';
    asked.querySelector('[data-export-orientation]').value = 'landscape';
    check('and an export with letter, landscape chosen is written', await exportTo(askedPage), {
      target: askedPage
    });
    const page = await t.pdfPageSize(await bytesOf(askedPage));
    check(
      'comes out letter, landscape — the card’s answer over the file’s own papersize',
      page !== null && Math.abs(page.width - 792) < 1 && Math.abs(page.height - 612) < 1,
      { page, own }
    );
    check(
      'and none of that edited the reader’s settings file',
      (await readText(settingsPath)) === settings,
      { settings: settingsPath }
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
