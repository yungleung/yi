/**
 * The citation forms nobody had asked citeproc about: a locator, a suppressed author, and a document
 * that resolves its keys without appending the list — asked for in the card, and asked for in the
 * reader's own settings file.
 *
 * The app's citations reach citeproc with a `--bibliography` and a `--csl` (the library the settings
 * name, the style it names), and what comes out of that was measured through the kinds that carry text
 * a probe can read. What was *not* measured is the syntax around the key: whether `[@smith2020, p. 45]`
 * puts the page number where citeproc's own grammar expects it, whether `-@smith2020` leaves the
 * author out of the parentheses, and whether `suppress-bibliography` can be asked for at all — a reader
 * who wants the keys resolved and no list at the end has nowhere else to say so.
 *
 * Read through an EPUB, because a book is a zip and `lib.js: zipEntry` inflates the chapter's own
 * XHTML: the citations and the reference list are text on a page a probe can hold, where a docx or an
 * odt would need their own readers. The forms are citeproc's and not the kind's, so the kind is only
 * how they are read back.
 *
 * @covers src-tauri/src/export.rs (the bibliography and the style reach pandoc), src/api/export.ts
 *   (the settings the library comes from), test/probes/lib.js (zipEntry)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
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
  const checkout = window.__probePaths.checkout;
  const folderName = `yi-probe-export-citations-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  // A locator, a suppressed author, and a plain citation to compare the first two against. The page
  // number is a number the note holds nowhere else, which is what makes it readable as the locator.
  const note = [
    '# Going out',
    '',
    'A locator: [@smith2020, p. 45].',
    '',
    'A suppressed author: -@smith2020.',
    '',
    'And a plain one: [@smith2020].',
    ''
  ].join('\n');
  /** The work `smith2020` is, as the fixture library has it — its title is how a *list* is told from a citation. */
  const title = 'code review practices in large-scale software development';

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
  /** Exports to `target` and answers with the chapter's own XHTML, or null when nothing was written.
   * The card's *no reference list* box is ticked first when the case is about it. */
  const exportTo = async (target, { noReferences = false } = {}) => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'epub' });
    await until(() => open(), 60);
    card().querySelector('[data-export-target]').value = target;
    if (noReferences) {
      card().querySelector('[data-export-no-references]').checked = true;
    }
    card().querySelector('[data-export-run]').click();
    const written = await until(async () => (await bytesOf(target)) !== null);
    const bytes = written ? await bytesOf(target) : null;
    if (bytes === null) {
      return null;
    }
    // Every page of the book, joined: the note is one chapter and the reference list is another, and
    // which is which is pandoc's business — what a reader sees is the book.
    const pages = t
      .zipNames(bytes)
      .filter((name) => name.endsWith('.xhtml') && !name.includes('nav'));
    const texts = [];
    for (const page of pages) {
      texts.push((await t.zipEntry(bytes, page)) ?? '');
    }
    return { text: texts.join('\n'), pages };
  };

  const before = await invoke('get_config');
  const epubConfig = (await invoke('export_config_path', { kind: 'epub' })) ?? '';
  const settingsBefore = await readText(epubConfig);
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
    // The library the app hands pandoc is the one its settings name, so the probe names one it can read
    // the entries of.
    await configManager.update({
      bibliography_file: `${checkout}test/fixtures/workspace/zotero.bib`
    });
    await show(notePath, note);
    await invoke('export_restore_config', { kind: 'epub' });

    const book = await exportTo(`${folder}/note.epub`);
  const chapter = book?.text ?? null;
    check(
      'the citations arrive as a page a probe can read — the book’s own chapter',
      typeof chapter === 'string' && chapter.includes('Smith'),
      { head: (chapter ?? '').slice(0, 120), pages: book?.pages ?? [] }
    );
    // The locator: the page number is in the note nowhere else, so where it lands is what citeproc made
    // of `[@key, p. 45]`.
    check(
      'and `[@key, p. 45]` carries the page number into the citation',
      (chapter ?? '').includes('45'),
      { citations: (chapter ?? '').match(/\([^)]*Smith[^)]*\)/g)?.slice(0, 4) ?? [] }
    );
    // The suppressed author: `-@key` leaves the year and takes the name out of *that* parentheses — the
    // plain citation beside it still names Smith, so what is held is the parenthetical that does not.
    check(
      'and `-@key` leaves a parenthetical with the year and no author',
      (chapter ?? '').includes('(2020)'),
      { citations: (chapter ?? '').match(/\([^)]*\)/g)?.slice(0, 6) ?? [] }
    );
    check(
      'with the list the library was handed for, under the heading the app asks for',
      (chapter ?? '').toLowerCase().includes(title) && (chapter ?? '').includes('References'),
      {
        list: (chapter ?? '').toLowerCase().includes(title),
        heading: (chapter ?? '').includes('References'),
        around: (chapter ?? '').slice(
          Math.max(0, (chapter ?? '').indexOf('References') - 60),
          (chapter ?? '').indexOf('References') + 400
        )
      }
    );

    // And the third question: a reader who wants the keys resolved and no list. The app's own way to say
    // it is the card's box — the same book, and the settings file is not touched at all.
    const byCardBook = await exportTo(`${folder}/no-list.epub`, { noReferences: true });
    const byCard = byCardBook?.text ?? null;
    check(
      'and the card’s own “no reference list” resolves the keys and appends nothing',
      typeof byCard === 'string' &&
        byCard.includes('Smith') &&
        !byCard.toLowerCase().includes(title) &&
        !byCard.includes('References'),
      {
        citations: (byCard ?? '').match(/\([^)]*Smith[^)]*\)/g)?.slice(0, 3) ?? [],
        list: (byCard ?? '').toLowerCase().includes(title),
        heading: (byCard ?? '').includes('References')
      }
    );

    // A file can say the same thing, and that is where the word comes from: `suppress-bibliography` is
    // **metadata**, not a variable — a `variables:` line leaves the list exactly where it was (measured,
    // this probe's first run), while the file's own `metadata:` block is what a defaults file is for.
    const settings = await readText(epubConfig);
    await files.writeTextAtomically(
      epubConfig,
      `${settings ?? ''}\nmetadata:\n  suppress-bibliography: true\n`
    );
    const suppressedBook = await exportTo(`${folder}/suppressed.epub`);
    const suppressed = suppressedBook?.text ?? null;
    check(
      'and `suppress-bibliography` resolves the keys and appends nothing',
      typeof suppressed === 'string' &&
        suppressed.includes('Smith') &&
        !suppressed.toLowerCase().includes(title) &&
        !suppressed.includes('References'),
      {
        citations: (suppressed ?? '').match(/\([^)]*Smith[^)]*\)/g)?.slice(0, 3) ?? [],
        list: (suppressed ?? '').toLowerCase().includes(title),
        heading: (suppressed ?? '').includes('References')
      }
    );
  } finally {
    if (settingsBefore !== null) {
      await files.writeTextAtomically(epubConfig, settingsBefore);
    }
    await configManager.save(before);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
