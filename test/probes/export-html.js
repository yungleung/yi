/**
 * The fourth kind, and the one whose promise is "one file".
 *
 * `self-contained: true` (Zettlr's) carries the page's stylesheet in the head. A picture the note
 * names on the web is different: Yi keeps the URL the author wrote, rather than fetching it into a
 * temporary file that is deleted after the run. That is what this probe looks at first — the URL
 * still linked and no `export/tmp/remote` path — and then at the rest of a document: the heading,
 * the math (KaTeX marks it; its script and stylesheet are CDN links, and the asset's header says
 * so), and the citations as a reference list in the page's style.
 *
 * @covers src-tauri/src/export/kinds.rs (KINDS), src-tauri/src/export/run.rs (pandoc_arguments),
 *   src/ui/export/export_dialog.ts
 * @needs-http-fixture
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const exportApi = await t.app('/src/api/export.ts');
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
  // A folder of this run's own — see `export-docx.js` for why: the live session is not reset
  // between runs, so a note opened twice under one name is one the session already holds.
  const folderName = `yi-probe-export-html-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note`;
  const pagePath = `${target}/note.html`;
  const url = `${window.__probeHttpBase}/image.png`;
  const note = [
    '# Going out',
    '',
    `A picture from the web: ![shot](${url}), math $e^{i\\pi}$, and a citation [@smith2020].`,
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
    '$$]{#eq:system .wide owner=demo}',
    '',
    '$$',
    '\\begin{gather}',
    'u=v',
    '\\end{gather}',
    '$$',
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
    // The shipped defaults are what this probe is about; the reader's copy in the app data is
    // theirs and is never overwritten by the app. The harness puts that copy back after the run.
    await invoke('export_restore_config', { kind: 'html' });
    await configManager.update({
      bibliography_file: `${checkout}test/fixtures/workspace/zotero.bib`
    });
    await show(notePath, note);
    check(
      'the note the probe opened is the document on screen',
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    // --- choosing the kind ---------------------------------------------------------------------

    await invoke('plugin:event|emit', { event: 'export', payload: 'html' });
    await until(() => open(), 60);
    const veil = card();
    const field = veil.querySelector('[data-export-target]');
    check(
      'the menu’s html item opens the card for the HTML kind, with a bundle-folder target',
      card().dataset.exportKind === 'html' &&
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
    const page = written ? await readText(pagePath) : '';
    const config = await exportApi.exportConfigPath('html');
    const configText = await readText(config);
    const shift = Number(
      /^shift-heading-level-by:\s*(-?\d+)/m.exec(configText)?.[1] ?? 0
    );
    const headingLevel = Math.min(6, Math.max(1, 1 + shift));
    check(
      'Export writes a whole HTML document',
      page.includes('<!DOCTYPE html>') && page.includes('<html'),
      { written, head: page.split('\n').slice(0, 2) }
    );
    check(
      'with the note’s heading at the level the settings file asks for',
      new RegExp(`<h${headingLevel}[^>]*>Going out</h${headingLevel}>`).test(page),
      {
        shift,
        heading: new RegExp(`<h${headingLevel}[^>]*>Going out`).exec(page)?.[0] ?? null
      }
    );
    check(
      'and the web picture stays the URL the note wrote instead of an app temporary file',
      page.includes(`src="${url}"`) &&
        !page.includes('src="data:image/png;base64,') &&
        !page.includes('/export/tmp/remote/') &&
        page.includes('<style'),
      {
        linked: page.includes(`src="${url}"`),
        carried: page.includes('src="data:image/png;base64,'),
        temporary: page.includes('/export/tmp/remote/'),
        style: page.includes('<style')
      }
    );
    check(
      'the math is marked for KaTeX rather than left as raw text',
      page.includes('class="math inline"') && /katex\.min\.(?:js|css)/i.test(page),
      {
        marked: page.includes('class="math inline"'),
        asset:
          /<(?:script|link)[^>]*katex[^>]*>/i.exec(page)?.[0]?.slice(0, 80) ?? null
      }
    );
    check(
      'and the citations are resolved into a reference list, headed and in the page’s style',
      page.includes('(Smith, 2020)') &&
        page.includes('>References<') &&
        page.includes('Smith, J. (2020)'),
      {
        citation: page.includes('(Smith, 2020)'),
        heading: page.includes('>References<'),
        entry: page.includes('Smith, J. (2020)')
      }
    );
    check(
      'a figure keeps its HTML target and numbered caption',
      /<div id="fig:demo">/.test(page) &&
        /<figcaption[^>]*>Figure 1\. Example figure<\/figcaption>/.test(page) &&
        page.includes('href="#fig:demo">Figure 1</a>'),
      {
        target: /<div id="fig:demo">/.exec(page)?.[0] ?? null,
        caption: /<figcaption[^>]*>[^<]*/.exec(page)?.[0] ?? null,
        link: /<a href="#fig:demo">[^<]*/.exec(page)?.[0] ?? null
      }
    );
    check(
      'a captioned table keeps its target, visible number, and template class',
      page.includes('id="tbl:results"') &&
        page.includes('Table 1. Results') &&
        page.includes('class="margin"') &&
        page.includes('href="#tbl:results">Table 1</a>'),
      {
        target: page.includes('id="tbl:results"'),
        caption: page.includes('Table 1. Results'),
        margin: page.includes('class="margin"'),
        link: page.includes('href="#tbl:results">Table 1</a>')
      }
    );
    check(
      'caption-only and ID-only tables are numbered with the right targets',
      page.includes('Table 2. Numbered without an ID') &&
        page.includes('Table 3.') &&
        page.includes('id="tbl:only"'),
      {
        captionOnly: page.includes('Table 2. Numbered without an ID'),
        idOnly: page.includes('Table 3.'),
        target: page.includes('id="tbl:only"')
      }
    );
    check(
      'a labeled equation keeps its target, one visible number, and unnumbered rows',
      page.includes('id="eq:system"') &&
        page.includes('Equation (1)') &&
        page.includes('begin{aligned}') &&
        !page.includes('\\begin{align}'),
      {
        target: page.includes('id="eq:system"'),
        label: page.includes('Equation (1)'),
        aligned: page.includes('begin{aligned}'),
        numberedAlign: page.includes('\\begin{align}'),
        equationContext: page.match(/.{0,120}Equation.{0,120}/)?.[0] ?? null
      }
    );
    check(
      'an unlabeled equation environment is also unnumbered',
      page.includes('begin{gather*}') && !page.includes('\\begin{gather}'),
      {
        starred: page.includes('begin{gather*}'),
        numbered: page.includes('\\begin{gather}'),
        gatherContext: page.match(/.{0,120}begin\{gather.{0,120}/)?.[0] ?? null
      }
    );
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      (hint?.textContent ?? '').includes('note'),
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
