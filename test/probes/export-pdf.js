/**
 * The sixth kind: the menu item for a PDF, the card it opens (the kind, its own target, the settings
 * file it would be written with), and the page that comes out — a real PDF through the TeX engine the
 * file names, which is the part worth proving here and the slowest thing in the export family.
 *
 * It outruns the bridge's five seconds on its own — measured, a single `xelatex` run is ~4 s here and
 * the card's setup ~1 s — and there is nothing to split it into, because the overrun *is* one export.
 * The harness says so when it happens (`recovered after the bridge timed out`, reading the result out
 * of the page's stash), which is what that recovery is for.
 *
 * @covers src-tauri/src/export.rs (run_export, export_with_pandoc, the pdf asset),
 *   src/ui/export/export_dialog.ts (a card that is about one kind)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
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
  const until = async (ready, tries = 150) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-pdf-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.pdf`;
  const note = [
    '---',
    'reference-labels:',
    '  figure: Diagram',
    '  listing: Code excerpt',
    'reference-number-prefixes:',
    '  figure: "2-"',
    '  listing: "2-"',
    '  table: X-',
    '  equation: E-',
    '  list: L-',
    '---',
    '',
    '# Going out',
    '',
    'A short paragraph with `inline code` and ~~strikethrough~~, and a citation [@smith2020].',
    '',
    'See [#fig:demo] and [#lst:demo].',
    '',
    `![Example figure](${window.__probePaths.checkout}src-tauri/icons/32x32.png){#fig:demo}`,
    '',
    '```python {#lst:demo caption="Example listing"}',
    'print(1)',
    '```',
    '',
    'See [#tbl:results] for the table.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    '| alpha | 1 |',
    '',
    ': Results {#tbl:results}',
    '',
    'See [#list:steps] for the procedure.',
    '',
    '- First step',
    '- Second step',
    '',
    ': Steps {#list:steps}',
    '',
    'See [#eq:system] for the equation.',
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
  const askForExport = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    return card();
  };

  const before = await invoke('get_config');
  const config = (await invoke('export_config_path', { kind: 'pdf' })) ?? '';
  const configBefore = await bytesOf(config);
  const settings = configBefore === null ? '' : new TextDecoder().decode(configBefore);
  if (settings !== '') {
    await files.writeTextAtomically(
      config,
      settings.replace(
        '\nhighlight-style: pygments\n',
        '\nhighlight-style: pygments\nsyntax-highlighting: idiomatic\n'
      )
    );
  }
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
      (document.querySelector('.prose')?.textContent ?? '').includes('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    // --- the kind, and what would write it -------------------------------------------------------

    const veil = await askForExport();
    await sleep(150);
    check(
      'the pdf card is about the pdf kind, and its target is the note’s own name with a .pdf',
      veil.dataset.exportKind === 'pdf' &&
        veil.querySelector('[data-export-target]').value === target,
      {
        kind: veil.dataset.exportKind ?? null,
        target: veil.querySelector('[data-export-target]')?.value ?? null
      }
    );
    check(
      'and the settings it would be written with are the kind’s own file, named on the card',
      veil.querySelector('[data-export-config]')?.closest('div')?.classList.contains('hidden') ===
        false &&
        (veil.querySelector('[data-export-config]')?.textContent ?? '').endsWith(
          '/export/export.pdf.yaml'
        ),
      {
        configRow: veil.querySelector('[data-export-config]')?.closest('div')?.className ?? null,
        config: veil.querySelector('[data-export-config]')?.textContent
      }
    );

    // --- the export itself -----------------------------------------------------------------------

    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const wrote = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const pdf = await bytesOf(target);
    check(
      'and a real PDF comes out, through the TeX engine the settings file names',
      wrote && pdf !== null && String.fromCharCode(...pdf.slice(0, 5)) === '%PDF-',
      {
        wrote,
        size: pdf?.length ?? 0,
        start: pdf === null ? null : String.fromCharCode(...pdf.slice(0, 5)),
        messages: [...document.querySelectorAll('[data-message-text]')].map(
          (element) => element.textContent
        )
      }
    );
    const text = pdf === null ? '' : await t.pdfText(pdf);
    check(
      'document labels and literal prefixes reach native figure and listing captions',
      text.includes('Diagram2-1') && text.includes('Codeexcerpt2-1'),
      {
        figure: text.includes('Diagram2-1'),
        listing: text.includes('Codeexcerpt2-1'),
        text: text.slice(0, 180)
      }
    );
    check(
      'and the automatic reference and caption use the note’s literal table prefix',
      text.includes('SeeTableX-1forthetable.') && text.includes('TableX-1:Results'),
      {
        text,
        reference: /SeeTable[^f]+forthetable\./.exec(text)?.[0] ?? null,
        caption: /Table[^:]+:Results/.exec(text)?.[0] ?? null
      }
    );
    check(
      'and the equation reference follows the native equation counter',
      text.includes('Equation(E-1)') && text.includes('(E-1)'),
      {
        reference: /Equation\([^)]+\)/.exec(text)?.[0] ?? null,
        text
      }
    );
    check(
      'and the list reference and caption follow the list object counter',
      text.includes('SeeListL-1fortheprocedure.') && text.includes('ListL-1.Steps'),
      {
        reference: /SeeList[^f]+fortheprocedure\./.exec(text)?.[0] ?? null,
        caption: /List[^.]+\.Steps/.exec(text)?.[0] ?? null,
        text
      }
    );

  } finally {
    if (configBefore !== null) {
      await files.writeTextAtomically(config, new TextDecoder().decode(configBefore));
    }
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
