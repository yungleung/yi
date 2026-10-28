/**
 * The seventh kind, and the one conversion that is *entirely* the app's: the note as every other
 * export is handed it — each wikilink written as the words it renders as, each citation as the words
 * it reads as in the page, the works they name listed under them — kept as a file of its own for a
 * reader who wants to hand the text to something else. No pandoc is asked for it and none is needed
 * (`KINDS` gives it `needs_pandoc: false`), which is what makes the pre-process the *whole*
 * conversion rather than one step ahead of one.
 *
 * Two things are worth pinning beyond the text: the *name* it is written under is
 * `note.processed.md`, not `note.md` (the default target is the note's own folder and its own name,
 * and an export that writes over the note it is exporting is not one anybody means), and the note's
 * headings keep their own levels — the family's defaults files shift them for a *document* whose
 * title sits above its first heading, and nothing here re-serializes the note at all.
 *
 * @covers src-tauri/src/export.rs (KINDS' name_suffix and needs_pandoc, export_own_text),
 *   src/ui/export/export_flow.ts (the card's target from the note's own path, the citations the app
 *   renders itself), src/ui/export/preprocess.ts (the citation rule and the reference list)
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
  const folderName = `yi-probe-export-markdown-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.processed.md`;
  const note = [
    '# Going out',
    '',
    'A link to [[other|an alias]], and a citation [@smith2020].',
    '',
    'An internal [heading reference](#heading-target).',
    '',
    '## Heading target {#heading-target .unnumbered}',
    '',
    'See [#fig:demo] for the picture.',
    '',
    `![Example figure](${window.__probePaths.checkout}src-tauri/icons/icon.png){#fig:demo .wide}`,
    '',
    'See [#tbl:results] for the data.',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    '| *alpha* | `one` |',
    '',
    ': **Results** {#tbl:results .margin owner=demo}',
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
    'See [#list:steps] for the procedure.',
    '',
    '- First step',
    '- Second step',
    '',
    ': Steps {#list:steps .wide owner=demo}',
    '',
    'See [#lst:demo] for the listing.',
    '',
    '```python {#lst:demo caption="Example listing"}',
    'print(1)',
    '```',
    '',
    'See [#eq:plain] and [#eq:system].',
    '',
    '[$$',
    'E=mc^2',
    '$$]{#eq:plain}',
    '',
    '[$$',
    '\\begin{align}',
    'x&=1\\\\',
    'y&=2',
    '\\end{align}',
    '$$]{#eq:system .wide}',
    '',
    '$$',
    '\\begin{gather}',
    'u=v',
    '\\end{gather}',
    '$$',
    '',
    '> [!NOTE]',
    '> A callout with [[other|an alias]].',
    '>',
    '> A second callout paragraph.',
    '',
    '::: {.callout .callout-definition title="Defined Term"}',
    'A term in a Div callout.',
    ':::',
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
    await files.writeTextAtomically(`${folder}/other.md`, '---\ntitle: The Other Note\n---\n\n# other\n');
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await configManager.update({
      bibliography_file: `${checkout}test/fixtures/workspace/zotero.bib`
    });
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    await invoke('plugin:event|emit', { event: 'export', payload: 'markdown' });
    await until(() => open(), 60);
    const veil = card();
    await sleep(150);
    check(
      'the plain markdown is written under the note’s own name with .processed, never over it',
      veil.querySelector('[data-export-target]').value === target,
      { target: veil.querySelector('[data-export-target]').value, note: notePath }
    );
    check(
      'and the card says the app writes this one itself, naming no settings file it has none of',
      (veil.querySelector('[data-export-status]')?.textContent ?? '').startsWith('Yi writes this') &&
        veil.querySelector('[data-export-config]')?.closest('div')?.classList.contains('hidden') ===
          true,
      {
        status: veil.querySelector('[data-export-status]')?.textContent ?? null,
        configRow: veil.querySelector('[data-export-config]')?.closest('div')?.className ?? null
      }
    );

    veil.querySelector('[data-export-run]').click();
    const written = await until(() => exists(target));
    const plain = written ? await readText(target) : '';
    check(
      'and the wikilink is written as the words it renders as',
      plain.includes('A link to an alias,') && !plain.includes('[['),
      {
        alias: plain.includes('A link to an alias,'),
        stillSyntax: plain.includes('[[')
      }
    );
    check(
      'with the citations resolved and their reference list appended by the app itself',
      plain.includes('(Smith, 2020)') &&
        /^## References$/m.test(plain) &&
        plain.includes('Smith, J. (2020)'),
      {
        citation: plain.includes('(Smith, 2020)'),
        heading: /^#+ References/m.exec(plain)?.[0] ?? null,
        entry: plain.includes('Smith, J. (2020)')
      }
    );
    check(
      'and the note’s own headings keep their levels',
      // The heading is the note's *first* line, so it is pinned by what it is rather than by what
      // precedes it — and the family's `shift-heading-level-by: 1` would have made it an `##`.
      /^# Going out$/m.test(plain) && !/^#{2,} Going out$/m.test(plain),
      { heading: /^#+ Going out/m.exec(plain)?.[0] ?? null }
    );
    check(
      'and native heading links and attributes survive processed Markdown',
      plain.includes('[heading reference](#heading-target)') &&
        plain.includes('## Heading target {#heading-target .unnumbered}'),
      {
        link: plain.includes('[heading reference](#heading-target)'),
        heading: /^## Heading target.*$/m.exec(plain)?.[0] ?? null
      }
    );
    check(
      'and figures become numbered HTML with an automatic-reference link',
      plain.includes('See [Figure 1](#fig:demo)') &&
        plain.includes('<figure id="fig:demo" class="wide">') &&
        plain.includes('<figcaption>Figure 1. Example figure</figcaption>'),
      {
        link: plain.includes('See [Figure 1](#fig:demo)'),
        figure: /<figure[^>]*id="fig:demo"[^>]*>/.exec(plain)?.[0] ?? null,
        caption: /<figcaption>.*<\/figcaption>/.exec(plain)?.[0] ?? null
      }
    );
    check(
      'and captioned tables become numbered, aligned HTML with their target and class',
      plain.includes('See [Table 1](#tbl:results)') &&
        plain.includes('<table id="tbl:results" class="margin" data-owner="demo">') &&
        plain.includes('<caption>Table 1. <strong>Results</strong></caption>') &&
        plain.includes('<th style="text-align: right">Value</th>') &&
        plain.includes('<td style="text-align: right"><code>one</code></td>'),
      {
        link: plain.includes('See [Table 1](#tbl:results)'),
        table: /<table[^>]*id="tbl:results"[^>]*>/.exec(plain)?.[0] ?? null,
        caption: /<caption>.*<\/caption>/.exec(plain)?.[0] ?? null,
        aligned: plain.includes('<th style="text-align: right">Value</th>')
      }
    );
    check(
      'and caption-only and ID-only tables stay numbered, with only the ID a target',
      plain.includes('<caption>Table 2. Numbered without an ID</caption>') &&
        plain.includes('<caption>Table 3.</caption>') &&
        plain.includes('<table id="tbl:only">') &&
        !plain.includes('<table id="">'),
      {
        captionOnly: plain.includes('<caption>Table 2. Numbered without an ID</caption>'),
        idOnly: plain.includes('<caption>Table 3.</caption>'),
        target: plain.includes('<table id="tbl:only">'),
        emptyTarget: plain.includes('<table id="">')
      }
    );
    const listDocument = new DOMParser().parseFromString(plain, 'text/html');
    const listTarget = listDocument.querySelector('#list\\:steps');
    check(
      'and a captioned list becomes targeted HTML with its numbered caption',
      plain.includes('See [List 1](#list:steps)') &&
        listTarget?.tagName === 'DIV' &&
        listTarget.querySelectorAll('ul > li').length === 2 &&
        listTarget.querySelector('.list-caption')?.textContent?.trim() === 'List 1. Steps',
      {
        link: plain.includes('See [List 1](#list:steps)'),
        tag: listTarget?.tagName ?? null,
        items: listTarget?.querySelectorAll('ul > li').length ?? 0,
        caption: listTarget?.querySelector('.list-caption')?.textContent?.trim() ?? null
      }
    );
    const listingDocument = new DOMParser().parseFromString(plain, 'text/html');
    const listingTarget = listingDocument.querySelector('#lst\\:demo');
    check(
      'and listings become numbered HTML with an automatic-reference link',
      plain.includes('See [Listing 1](#lst:demo)') &&
        listingTarget?.querySelector('figcaption')?.textContent?.trim() ===
          'Listing 1. Example listing' &&
        listingTarget?.querySelector('pre code')?.textContent?.includes('print(1)') === true,
      {
        link: plain.includes('See [Listing 1](#lst:demo)'),
        listing: listingTarget?.tagName ?? null,
        caption: listingTarget?.querySelector('figcaption')?.textContent?.trim() ?? null
      }
    );
    const equationDocument = new DOMParser().parseFromString(plain, 'text/html');
    const equationLayouts = [...equationDocument.querySelectorAll('table.equation-layout')].map(
      (table) => {
        const cells = table.querySelectorAll('tbody > tr > td');
        const numberStyle = cells[1]?.getAttribute('style') ?? '';
        return {
          target: table.closest('.equation-target')?.id ?? null,
          cells: cells.length,
          number: cells[1]?.textContent?.trim() ?? null,
          minWidth: numberStyle.includes('min-width: 4em'),
          leftAligned: numberStyle.includes('text-align: left')
        };
      }
    );
    const expectedEquationLayouts = [
      {
        target: 'eq:plain',
        cells: 2,
        number: '(1)',
        minWidth: true,
        leftAligned: true
      },
      {
        target: 'eq:system',
        cells: 2,
        number: '(2)',
        minWidth: true,
        leftAligned: true
      },
      {
        target: null,
        cells: 2,
        number: '',
        minWidth: true,
        leftAligned: true
      }
    ];
    check(
      'and all display equations become MathML in the shared reserved-cell layout',
      plain.includes(
        'See [Equation (1)](#eq:plain) and [Equation (2)](#eq:system)'
      ) &&
        plain.includes('<div id="eq:plain" class="equation-target equation-layout">') &&
        plain.includes(
          '<div id="eq:system" class="equation-target equation-layout wide">'
        ) &&
        plain.includes('<span class="equation-number">(1)</span>') &&
        plain.includes('<span class="equation-number">(2)</span>') &&
        plain.includes('annotation encoding="application/x-tex">\\begin{aligned}'),
      {
        references: plain
          .split('\n')
          .filter((line) => line.includes('Equation'))
          .slice(0, 8),
        links: plain.includes(
          'See [Equation (1)](#eq:plain) and [Equation (2)](#eq:system)'
        ),
        layouts:
          JSON.stringify(equationLayouts) === JSON.stringify(expectedEquationLayouts),
        plain: plain.includes(
          '<div id="eq:plain" class="equation-target equation-layout">'
        ),
        align: plain.includes(
          '<div id="eq:system" class="equation-target equation-layout wide">'
        ),
        numbers:
          plain.includes('<span class="equation-number">(1)</span>') &&
          plain.includes('<span class="equation-number">(2)</span>'),
        annotation: plain.includes(
          'annotation encoding="application/x-tex">\\begin{aligned}'
        )
      }
    );
    check(
      'and both callout forms become semantic Divs with their title and body',
      plain.includes(':::: {.callout .callout-note}') &&
        plain.includes('::: {.callout-title}\nNote\n:::') &&
        plain.includes('A callout with an alias.') &&
        plain.includes('A second callout paragraph.') &&
        plain.includes(':::: {.callout .callout-definition title="Defined Term"}') &&
        plain.includes('A term in a Div callout.') &&
        !plain.includes('[!NOTE]'),
      {
        note: plain.includes(':::: {.callout .callout-note}'),
        title: plain.includes('::: {.callout-title}\nNote\n:::'),
        link: plain.includes('A callout with an alias.'),
        second: plain.includes('A second callout paragraph.'),
        custom: plain.includes(
          ':::: {.callout .callout-definition title="Defined Term"}'
        ),
        body: plain.includes('A term in a Div callout.'),
        nativeAlert: plain.includes('[!NOTE]')
      }
    );

    // And a reader may ask for the citations resolved with **no list** — the card's own box. For this
    // kind that is the app's own code rather than pandoc's metadata: there is nothing to list, so no
    // heading and no entry are written, and the citations in the text read as they do.
    await invoke('plugin:event|emit', { event: 'export', payload: 'markdown' });
    await until(() => open(), 60);
    const second = card();
    await sleep(150);
    const noList = `${folder}/note.no-list.processed.md`;
    second.querySelector('[data-export-no-references]').checked = true;
    second.querySelector('[data-export-target]').value = noList;
    second.querySelector('[data-export-run]').click();
    const wroteNoList = await until(() => exists(noList));
    const withoutList = wroteNoList ? await readText(noList) : '';
    check(
      'and the card can ask for the citations without their list, which this kind writes itself',
      withoutList.includes('(Smith, 2020)') &&
        !withoutList.includes('References') &&
        !withoutList.includes('Smith, J. (2020)'),
      {
        citation: withoutList.includes('(Smith, 2020)'),
        heading: /^#+ References/m.exec(withoutList)?.[0] ?? null,
        entry: withoutList.includes('Smith, J. (2020)')
      }
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
