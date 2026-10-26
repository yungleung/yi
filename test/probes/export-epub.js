/**
 * The fifth kind, the one that is a *book*: a container with its own title page, its navigation and
 * its pictures inside it.
 *
 * An EPUB is a zip, so this probe reads it the way a reader's own software does — and reads *inside*
 * it, which no other kind's probe can: the page inflates an entry by name (the zip's central
 * directory, then the entry's own data through `DecompressionStream`), so the book's metadata is
 * something to assert rather than something to take on trust. What is asserted is what makes it a
 * book: `mimetype`, read first and stored, saying `application/epub+zip`; a `container.xml` and a
 * `content.opf`; the *note's own frontmatter* as the book's title, author and language (the one place
 * a book's name belongs — a defaults file that said so would override the note, which is why
 * `export.epub.yaml` says nothing about metadata at all); the picture the app *fetched from the web*
 * carried in `EPUB/media/`; and the citations resolved into a `References` section of the chapter.
 *
 * @covers src-tauri/src/export/kinds.rs (KINDS), src-tauri/src/export/run.rs (pandoc_arguments),
 *   src/ui/export/export_dialog.ts, src-tauri/assets/export/export.epub.yaml
 * @needs-http-fixture
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
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
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 120) => {
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
  // A folder of this run's own — see `export-docx.js` for why: the live session is not reset
  // between runs, so a note opened twice under one name is one the session already holds.
  const folderName = `yi-probe-export-epub-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.epub`;
  const url = `${window.__probeHttpBase}/image.png`;
  const note = [
    '---',
    'title: The Book of Going Out',
    'author: The Reader',
    'lang: en-GB',
    '---',
    '',
    '# Going out',
    '',
    `A picture from the web: ![shot](${url}), and a citation [@smith2020].`,
    '',
    'See [#fig:demo] for the figure.',
    '',
    `![Example figure](${url}){#fig:demo .wide}`,
    '',
    'See [#tbl:results] for the data.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    '| alpha | 1 |',
    '',
    ': Results {#tbl:results .margin owner=demo}',
    '',
    '| Caption only |',
    '| --- |',
    '| no target |',
    ': Numbered without an ID',
    '',
    '| ID only |',
    '| --- |',
    '| target |',
    ': {#tbl:only}',
    '',
    'See [#eq:system] for the equations.',
    '',
    '[$$',
    '\\begin{align}',
    'x&=1\\\\',
    'y&=2',
    '\\end{align}',
    '$$]{#eq:system}',
    ''
  ].join('\n');

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
    // The book is built with the file **this build ships**, put there by the app's own command: a
    // reader's copy may be older — measured, one was, and it hid a change to the book's own shape for
    // two rounds of work — and a book made with it says nothing about the file a fresh install gets.
    // The harness puts the reader's copy back when the run is over (`restoreTheExportSettings`).
    await invoke('export_restore_config', { kind: 'epub' });
    await configManager.update({
      bibliography_file: `${checkout}test/fixtures/workspace/zotero.bib`
    });
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').includes('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    // --- choosing the kind ---------------------------------------------------------------------

    await invoke('plugin:event|emit', { event: 'export', payload: 'epub' });
    await until(() => open(), 60);
    const veil = card();
    const field = veil.querySelector('[data-export-target]');
    check(
      'the menu’s epub item opens the card for the EPUB kind, and the target becomes a .epub',
      card().dataset.exportKind === 'epub' &&
        field.value === target,
      { kind: card().dataset.exportKind, chosen: field.value }
    );

    // --- the book -------------------------------------------------------------------------------

    field.value = target;
    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const written = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const bytes = await bytesOf(target);
    if (bytes === null) {
      check('Export writes an EPUB where the reader asked', false, { written });
    } else {
      const names = new TextDecoder('latin1').decode(bytes);
      const mimetype = await t.zipEntry(bytes, 'mimetype');
      check(
        'Export writes an EPUB: a container whose first entry is the stored mimetype',
        written && mimetype === 'application/epub+zip' && bytes[30] === 0x6d,
        { written, mimetype, first: names.slice(30, 50) }
      );
      check(
        'with the parts a reader’s software looks for',
        names.includes('META-INF/container.xml') &&
          names.includes('EPUB/content.opf') &&
          names.includes('EPUB/nav.xhtml') &&
          names.includes('EPUB/text/ch001.xhtml'),
        { entries: names.match(/EPUB\/[a-zA-Z0-9_./-]+/g)?.slice(0, 8) ?? [] }
      );
      const opf = (await t.zipEntry(bytes, 'EPUB/content.opf')) ?? '';
      check(
        'and the note’s own frontmatter as the book’s name, author and language',
        opf.includes('<dc:title id="epub-title-1">The Book of Going Out</dc:title>') &&
          opf.includes('<dc:creator id="epub-creator-1">The Reader</dc:creator>') &&
          opf.includes('<dc:language>en-GB</dc:language>'),
        {
          title: /<dc:title[^>]*>[^<]*/.exec(opf)?.[0] ?? null,
          creator: /<dc:creator[^>]*>[^<]*/.exec(opf)?.[0] ?? null,
          language: /<dc:language>[^<]*/.exec(opf)?.[0] ?? null
        }
      );
      // Every page of the book, joined: the note is one chapter and the reference list is another —
      // with the shipped `shift-heading-level-by: 0` a note's own `#` heading is where a chapter starts,
      // and so is the list pandoc appends under the heading the app asks for. Which file is which is
      // pandoc's business; what a reader sees is the book (`export-citations.js` reads it the same way).
      const pages = t
        .zipNames(bytes)
        .filter((name) => name.endsWith('.xhtml') && !name.includes('nav'));
      const texts = [];
      for (const page of pages) {
        texts.push((await t.zipEntry(bytes, page)) ?? '');
      }
      const chapter = texts.join('\n');
      check(
        'the picture the app fetched from the web is carried in the book, not linked',
        names.includes('EPUB/media/') && chapter.includes('../media/'),
        {
          media: names.match(/EPUB\/media\/[a-zA-Z0-9_.-]+/)?.[0] ?? null,
          referenced: chapter.includes('../media/')
        }
      );
      check(
        'and the citations are resolved into a References section of the book',
        chapter.includes('(Smith, 2020)') &&
          chapter.includes('References') &&
          chapter.includes('Smith, J. (2020)'),
        {
          citation: chapter.includes('(Smith, 2020)'),
          heading: chapter.includes('References'),
          entry: chapter.includes('Smith, J. (2020)'),
          pages
        }
      );
    check(
      'a figure keeps its HTML anchor, caption, and automatic link in the chapter',
      texts.some(
        (chapter) =>
          chapter.includes('id="fig:demo"') &&
          /<figcaption[^>]*>Figure 1\. Example figure<\/figcaption>/.test(chapter) &&
          chapter.includes('href="ch001.xhtml#fig:demo">Figure 1</a>')
      ),
      texts.map((chapter) => ({
        target: chapter.includes('id="fig:demo"'),
        caption: /<figcaption[^>]*>Figure 1\. Example figure<\/figcaption>/.test(chapter),
        link: chapter.includes('href="ch001.xhtml#fig:demo">Figure 1</a>')
      }))
    );
    check(
      'a captioned table keeps its anchor, visible number, link, and class',
      texts.some(
        (chapter) =>
          chapter.includes('id="tbl:results"') &&
          chapter.includes('Table 1. Results') &&
          chapter.includes('class="margin"') &&
          chapter.includes('href="ch001.xhtml#tbl:results">Table 1</a>')
      ),
      texts.map((chapter) => ({
        target: chapter.includes('id="tbl:results"'),
        caption: chapter.includes('Table 1. Results'),
        margin: chapter.includes('class="margin"'),
        link: chapter.includes('href="ch001.xhtml#tbl:results">Table 1</a>')
      }))
    );
    check(
      'caption-only and ID-only tables keep their number and target behavior',
      texts.some(
        (chapter) =>
          chapter.includes('Table 2. Numbered without an ID') &&
          chapter.includes('Table 3.') &&
          chapter.includes('id="tbl:only"')
      ),
      texts.map((chapter) => ({
        captionOnly: chapter.includes('Table 2. Numbered without an ID'),
        idOnly: chapter.includes('Table 3.'),
        target: chapter.includes('id="tbl:only"')
      }))
    );
    check(
      'a labeled equation keeps one anchor and one visible number',
      texts.some(
        (chapter) =>
          chapter.includes('id="eq:system"') &&
          chapter.includes('Equation (1)') &&
          chapter.replace('<a href="#eq:system">Equation (1)</a>', '').includes('(1)') &&
          !chapter.includes('eqn-num')
      ),
      texts.map((chapter) => ({
        target: chapter.includes('id="eq:system"'),
        reference: chapter.includes('Equation (1)'),
        number: chapter
          .replace('<a href="#eq:system">Equation (1)</a>', '')
          .includes('(1)'),
        native: chapter.includes('eqn-num')
      }))
    );
    }
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      (hint?.textContent ?? '').includes('note.epub'),
      hint?.textContent ?? null
    );
  } finally {
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
