/**
 * The third kind: a `.tex` the reader compiles themselves.
 *
 * LaTeX is the kind where the *file the document refers to* matters most, because the pictures are
 * only referred to (`self-contained: false`, Zettlr's own setting — `\includegraphics` names a
 * portable relative path and the app copies the bytes beside the `.tex`): what the reader's LaTeX
 * finds is what the app wrote down, so this probe uses a picture whose *name* holds a space, a `#`
 * and a `%` — the three characters that mean something else in either language — and then reads the
 * path back out of the `.tex`, un-escapes it, and checks that the file is there. The other half of a
 * LaTeX export is that it is
 * a *whole* document (`\documentclass` and `\begin{document}`: `export.latex.yaml` says
 * `standalone: true` outright, because Zettlr's file is one only through a side effect of
 * `title-prefix` — measured), and that the citations became a reference list in the page's style.
 * The third has no counterpart in the other kinds: a `.tex` of a note the TeX suite has no font for is
 * one the reader's compile loses the characters of, and the font can only come from **this file** — it
 * is compiled on their machine, so the app's own faces cannot reach it, and a name written here has to
 * be one *that* machine has. So the file ships **no** name, and the card's hint is what tells a reader
 * their note needs one (a wrong name fails the compile; no name is a page the card warned about). Both
 * halves are held here: the `.tex` of a CJK note carries no font setup as the file comes, and carries
 * `\usepackage{xeCJK}` and the name for the length of one export where a reader has written one —
 * measured before this, and again by the second export below.
 *
 * @covers src-tauri/src/export.rs (KINDS, pandoc_arguments), src/ui/export/dialog/index.ts,
 *   src/ui/export/pipeline/preprocess.ts (the destination the writer is handed)
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
  // A folder of this run's own — see `export-docx.js` for why: the live session is not reset
  // between runs, so a note opened twice under one name is one the session already holds.
  const folderName = `yi-probe-export-latex-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const picture = 'a b#c%.png';
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.tex`;
  const note = [
    '---',
    'amsthm:',
    '  styles:',
    '    custom-definition: {}',
    '  custom-definition:',
    '    - Definition',
    '---',
    '',
    '# Going out',
    '',
    `A picture: ![shot](${picture}), and a citation [@smith2020].`,
    '',
    'And 简体中文 beside it.',
    '',
    '::: {#thm:tex .Theorem info="TeX"}',
    'Every theorem survives.',
    ':::',
    '',
    'See [#thm:tex].',
    '',
    '::: {#def:tex .Definition info="TeX"}',
    'A declared definition survives.',
    ':::',
    '',
    'See [#def:tex].',
    '',
    'See [#fig:demo] for the numbered figure.',
    '',
    `![Demo figure](${picture}){#fig:demo .wide}`,
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
    'See [#list:steps] for the procedure.',
    '',
    '- First step',
    '- Second step',
    '',
    ': Steps {#list:steps .wide owner=demo}',
    '',
    'See [#lst:id-only] and [#lst:full]. A caption-only block follows:',
    '',
    '```python {caption="Caption only"}',
    'print(0)',
    '```',
    '',
    '```python {#lst:id-only}',
    'print(1)',
    '```',
    '',
    '```python {#lst:full caption="Example listing"}',
    'print(2)',
    '```',
    '',
    'See [#eq:system] for the equation system.',
    '',
    '[$$',
    '\\begin{align}',
    'x&=1\\\\',
    'y&=2',
    '\\end{align}',
    '$$]{#eq:system}',
    '',
    '> [!NOTE]',
    '> A callout body preserved in LaTeX.',
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
  // This kind's settings file is read twice below — the bytes this build ships, and the same bytes with a
  // line a reader wrote — and the copy in the app's data folder was written once, by whatever build the
  // reader first exported this kind with. So it is the *shipped* file the two exports run against, and
  // the reader's own copy goes back at the end.
  const settings = (await invoke('export_config_path', { kind: 'latex' })) ?? '';
  const settingsBefore = await readText(settings).catch(() => null);
  await invoke('export_restore_config', { kind: 'latex' });
    const idiomaticSettings = (await readText(settings)).replace(
      '\nhighlight-style: pygments\n',
      '\nhighlight-style: pygments\nsyntax-highlighting: idiomatic\n'
    );
    await files.writeTextAtomically(settings, idiomaticSettings);
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    // A real picture under an awkward name: the app's own icon, copied beside the note (a probe
    // cannot write bytes, but it can copy a file the app ships).
    await invoke('plugin:fs|copy_file', {
      fromPath: `${checkout}src-tauri/icons/32x32.png`,
      toPath: `${folder}/${picture}`,
      options: {}
    });
    await t.openWorkspace(folder);
    // The library the app hands pandoc is the one its settings name, so this probe names one it can
    // rely on — the fixtures' own — and puts the reader's back afterwards.
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

    await invoke('plugin:event|emit', { event: 'export', payload: 'latex' });
    await until(() => open(), 60);
    const veil = card();
    const field = veil.querySelector('[data-export-target]');
    check(
      'the menu’s latex item opens the card for the LaTeX kind, and the target becomes a .tex',
      card().dataset.exportKind === 'latex' &&
        field.value === target,
      { kind: card().dataset.exportKind, chosen: field.value }
    );

    // --- the document ---------------------------------------------------------------------------

    field.value = target;
    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const written = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const tex = written ? await readText(target) : '';
    check(
      'Export writes a whole LaTeX document, not a fragment',
      tex.includes('\\documentclass') && tex.includes('\\begin{document}'),
      { written, head: tex.split('\n').slice(0, 2) }
    );
    check(
      'with the note’s heading as a section of it',
      /\\(?:chapter|section|subsection)\{Going out\}/.test(tex),
      { section: /\\(?:chapter|section|subsection)\{Going out\}/.exec(tex)?.[0] ?? null }
    );
    check(
      'a theorem environment is declared before the filter’s native block and reference',
      tex.includes('\\usepackage{amsthm}') &&
        tex.includes('\\newtheorem{Theorem}{Theorem}') &&
        tex.includes('\\begin{Theorem}[TeX]\\label{thm:tex}') &&
        /Theorem~\\ref\{thm:tex\}/.test(tex),
      {
        package: tex.includes('\\usepackage{amsthm}'),
        declaration: tex.includes('\\newtheorem{Theorem}{Theorem}'),
        block: /\\begin\{Theorem\}(?:\[[^\]]*\])?\\label\{thm:tex\}/.exec(tex)?.[0] ?? null,
        reference: /Theorem~\\ref\{thm:tex\}/.exec(tex)?.[0] ?? null
      }
    );
    check(
      'a declared custom kind gains its own native environment and reference',
      tex.includes('\\newtheorem{Definition}{Definition}') &&
        tex.includes('\\begin{Definition}[TeX]\\label{def:tex}') &&
        /Definition~\\ref\{def:tex\}/.test(tex),
      {
        declaration: tex.includes('\\newtheorem{Definition}{Definition}'),
        block: /\\begin\{Definition\}(?:\[[^\]]*\])?\\label\{def:tex\}/.exec(tex)?.[0] ?? null,
        reference: /Definition~\\ref\{def:tex\}/.exec(tex)?.[0] ?? null
      }
    );
    check(
      'and no font setup of its own: this file names none, so the compile is not stopped by a name the reader’s machine may not have',
      !tex.includes('\\usepackage{xeCJK}') && !tex.includes('\\setCJKmainfont'),
      { package: tex.includes('\\usepackage{xeCJK}'), fonts: tex.includes('\\setCJKmainfont') }
    );

    // The other half, for the reader the card tells to name one: their line, written over the shipped
    // file for the length of one export. The name is only a value in a file this probe is about to hand
    // pandoc — nothing is compiled here, so whether a machine has it is the reader's business, not this
    // probe's, and what is held is that the line reaches the document.
    const shipped = await readText(settings);
    try {
      // The shape the file ships: `variables: {}`, an empty map, because comments under a bare
      // `variables:` leave it null and pandoc refuses the file (measured, "Expecting MapVal").
      // Anchored on the *line*, newlines and all: the header's own comment mentions `variables: {}` too,
      // and replacing that occurrence writes a comment into the file pandoc is handed (measured, on this
      // very probe — it is the mistake the roadmap's font entry warns about).
      const written = shipped.replace(
        '\nvariables: {}\n',
        '\nvariables:\n  CJKmainfont: "A reader\'s font"\n'
      );
      check(
        'the reader’s line goes into their own settings file, where pandoc reads it',
        written !== shipped,
        { line: written.split('\n').filter((line) => line.includes('CJKmainfont')) }
      );
      await files.writeTextAtomically(settings, written);
      // The card closes with a successful export, so the second one asks for it again.
      await invoke('plugin:event|emit', { event: 'export', payload: 'latex' });
      await until(() => open(), 60);
      // And it fills its own target in as it draws — measured here, where the first export's target
      // happens to be the one the card would choose and so a race would never show.
      await sleep(250);
      const targetNamed = `${folder}/named.tex`;
      card().querySelector('[data-export-target]').value = targetNamed;
      const namedHints = t.hintsNow();
      card().querySelector('[data-export-run]').click();
      const namedWritten = await until(
        () => t.newHint(namedHints, (words) => words.startsWith('Exported to')) !== null
      );
      const named = namedWritten ? await readText(targetNamed) : '';
      check(
        'a reader who names one gets it: xeCJK and that name are in the document',
        named.includes('\\usepackage{xeCJK}') &&
          /\\setCJKmainfont\[\]\{A reader's font\}/.test(named),
        {
          package: named.includes('\\usepackage{xeCJK}'),
          font: /\\setCJKmainfont\[\]\{[^}]*\}/.exec(named)?.[0] ?? null
        }
      );
    } finally {
      await files.writeTextAtomically(settings, shipped);
    }

    // The picture: the relative path pandoc wrote down, un-escaped, is the file the app copied.
    // `\pandocbounded{\includegraphics[keepaspectratio,alt={shot}]{the path}}` — the first brace
    // group after the options is the file the writer was handed.
    const written_path = /\\includegraphics\[[^\]]*\]\{([^{}]*)\}/.exec(tex)?.[1] ?? null;
    const unescaped =
      written_path === null ? null : written_path.replace(/\\([#$%&_{}])/g, '$1').trim();
    const portable = `note.assets/${picture}`;
    const there = unescaped === null ? null : await exists(`${folder}/${unescaped}`);
    check(
      'and the picture it refers to is the portable file beside the source — spaces, # and % and all',
      unescaped === portable && there === true,
      { written: written_path, unescaped, there }
    );
    check(
      'the citations are resolved and the reference list appended, headed and in the page’s style',
      tex.includes('(Smith, 2020)') &&
        /\\(?:chapter|section|subsection)\*\{References\}/.test(tex) &&
        tex.includes('\\bibitem') &&
        tex.includes('Smith, J. (2020)'),
      {
        citation: tex.includes('(Smith, 2020)'),
        heading:
          /\\(?:chapter|section|subsection)\*\{References\}/.exec(tex)?.[0] ?? null,
        entry: tex.includes('Smith, J. (2020)')
      }
    );
    check(
      'a figure keeps its numeric target and its automatic reference becomes hyperref text',
      /\\label\{fig:demo\}/.test(tex) &&
        /\\hyperref\[fig:demo\]\{Figure 1\}/.test(tex) &&
        /\\caption\{Demo figure\}/.test(tex),
      {
        label: /\\label\{fig:demo\}/.exec(tex)?.[0] ?? null,
        link: /\\hyperref\[fig:demo\]\{[^}]*\}/.exec(tex)?.[0] ?? null,
        caption: /\\caption\{[^}]*\}/.exec(tex)?.[0] ?? null
      }
    );
    check(
      'a table keeps its native caption and label while its reference uses the package counter',
      tex.includes('\\yiTableRef{tbl:results}') &&
        /\\label\{tbl:results\}/.test(tex) &&
        /\\caption\{Results\}/.test(tex) &&
        /\\caption\{Numbered without an ID\}/.test(tex) &&
        /\\label\{tbl:only\}/.test(tex),
      {
        reference: tex.includes('\\yiTableRef{tbl:results}'),
        label: /\\label\{tbl:results\}/.exec(tex)?.[0] ?? null,
        caption: /\\caption\{Results\}/.exec(tex)?.[0] ?? null,
        captionOnly: /\\caption\{Numbered without an ID\}/.exec(tex)?.[0] ?? null,
        idOnly: /\\label\{tbl:only\}/.exec(tex)?.[0] ?? null
      }
    );
    check(
      'the table-reference header is part of the exported LaTeX document',
      tex.includes('\\providecommand{\\yiTableRef}[1]') &&
        tex.includes('\\renewcommand{\\tablename}{Table}'),
      {
        macro: tex.includes('\\providecommand{\\yiTableRef}[1]'),
        label: tex.includes('\\renewcommand{\\tablename}{Table}')
      }
    );
    check(
      'a captioned list uses the Yi counter and a native reference',
      tex.includes('\\yiListRef{list:steps}') &&
        tex.includes('\\refstepcounter{yilist}') &&
        tex.includes('\\label{list:steps}') &&
        tex.includes('\\yiListName~\\theyilist.'),
      {
        reference: tex.includes('\\yiListRef{list:steps}'),
        counter: tex.includes('\\refstepcounter{yilist}'),
        label: tex.includes('\\label{list:steps}'),
        caption: tex.includes('\\yiListName~\\theyilist.')
      }
    );
    check(
      'the list-reference header is part of the exported LaTeX document',
      tex.includes('\\providecommand{\\yiListRef}[1]') &&
        tex.includes('\\providecommand{\\yiListCounterSetup}{}') &&
        tex.includes('\\newcounter{yilist}'),
      {
        macro: tex.includes('\\providecommand{\\yiListRef}[1]'),
        hook: tex.includes('\\providecommand{\\yiListCounterSetup}{}'),
        counter: tex.includes('\\newcounter{yilist}')
      }
    );
    check(
      'native listings keep ID-driven order under idiomatic highlighting',
      tex.includes('title={Caption only}') &&
        tex.includes('caption={\\hspace{0pt}}') &&
        tex.includes('caption={Example listing}') &&
        /\\hyperref\[lst:id-only\]\{Listing 1\}/.test(tex) &&
        /\\hyperref\[lst:full\]\{Listing 2\}/.test(tex),
      {
        captionOnly: tex.includes('title={Caption only}'),
        idOnly: tex.includes('caption={\\hspace{0pt}}'),
        full: tex.includes('caption={Example listing}'),
        idLink: /\\hyperref\[lst:id-only\]\{[^}]*\}/.exec(tex)?.[0] ?? null,
        fullLink: /\\hyperref\[lst:full\]\{[^}]*\}/.exec(tex)?.[0] ?? null
      }
    );
    check(
      'a labeled equation becomes one native equation with a counter-backed reference',
      tex.includes('\\yiEquationRef{eq:system}') &&
        (tex.match(/\\begin\{equation\}/g) ?? []).length === 1 &&
        tex.includes('\\begin{aligned}') &&
        !tex.includes('\\begin{align}') &&
        tex.includes('\\label{eq:system}'),
      {
        reference: tex.includes('\\yiEquationRef{eq:system}'),
        equations: (tex.match(/\\begin\{equation\}/g) ?? []).length,
        aligned: tex.includes('\\begin{aligned}'),
        numberedAlign: tex.includes('\\begin{align}'),
        label: tex.includes('\\label{eq:system}')
      }
    );
    check(
      'the equation-reference macro is in the generated header',
      tex.includes('\\providecommand{\\yiEquationRef}[1]') &&
        tex.includes('\\renewcommand{\\equationname}{Equation}'),
      {
        macro: tex.includes('\\providecommand{\\yiEquationRef}[1]'),
        label: tex.includes('\\renewcommand{\\equationname}{Equation}')
      }
    );
    check(
      'a callout keeps its visible title and body without requiring a package filter',
      tex.includes('Note') && tex.includes('A callout body preserved in LaTeX.'),
      {
        title: tex.includes('Note'),
        body: tex.includes('A callout body preserved in LaTeX.')
      }
    );
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      // The *last* export this probe ran is the reader's own line, so that is the name the card owes.
      (hint?.textContent ?? '').includes('named.tex'),
      hint?.textContent ?? null
    );
  } finally {
    await configManager.save(before);
    // The reader's own copy of this kind's settings file, exactly as this run found it — no other part
    // of the app puts that back, and the run wrote the shipped bytes over it.
    if (settingsBefore === null) {
      try {
        await files.deleteEntry(settings);
      } catch {
        // Nothing to remove.
      }
    } else {
      await files.writeTextAtomically(settings, settingsBefore);
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
