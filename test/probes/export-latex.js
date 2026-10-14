/**
 * The third kind: a `.tex` the reader compiles themselves.
 *
 * LaTeX is the kind where the *file the document refers to* matters most, because the pictures are
 * only referred to (`self-contained: false`, Zettlr's own setting — `\includegraphics` with the
 * path the app resolved, not the bytes): what the reader's LaTeX finds is what the app wrote down,
 * so this probe uses a picture whose *name* holds a space, a `#` and a `%` — the three characters
 * that mean something else in either language — and then reads the path back out of the `.tex`,
 * un-escapes it, and checks that the file is there. The other half of a LaTeX export is that it is
 * a *whole* document (`\documentclass` and `\begin{document}`: `export.latex.yaml` says
 * `standalone: true` outright, because Zettlr's file is one only through a side effect of
 * `title-prefix` — measured), and that the citations became a reference list in the page's style.
 *
 * @covers src-tauri/src/export.rs (KINDS, pandoc_arguments), src/ui/export/export_dialog.ts,
 *   src/ui/export/preprocess.ts (the destination the writer is handed)
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
  // A folder of this run's own — see `export-docx.js` for why: the live session is not reset
  // between runs, so a note opened twice under one name is one the session already holds.
  const folderName = `yi-probe-export-latex-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const picture = 'a b#c%.png';
  const notePath = `${folder}/note.md`;
  const target = `${folder}/note.tex`;
  const note = [
    '# Going out',
    '',
    `A picture: ![shot](${picture}), and a citation [@smith2020].`,
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
      (document.querySelector('.prose')?.textContent ?? '').startsWith('Going out'),
      { onScreen: (document.querySelector('.prose')?.textContent ?? '').slice(0, 24) }
    );

    // --- choosing the kind ---------------------------------------------------------------------

    await invoke('plugin:event|emit', { event: 'export', payload: null });
    await until(() => open(), 60);
    const veil = card();
    const field = veil.querySelector('[data-export-target]');
    const docxTarget = field.value;
    const latex = veil.querySelector('[data-export-kind="latex"]');
    latex?.click();
    await sleep(150);
    check(
      'pressing the latex tab moves the choice, and the target becomes a .tex',
      latex !== null &&
        latex.closest('li')?.classList.contains('menu-active') === true &&
        docxTarget.endsWith('/note.docx') &&
        field.value === target,
      { docxTarget, chosen: field.value }
    );

    // --- the document ---------------------------------------------------------------------------

    field.value = target;
    veil.querySelector('[data-export-run]').click();
    const written = await until(() => exists(target));
    const tex = written ? await readText(target) : '';
    check(
      'Export writes a whole LaTeX document, not a fragment',
      tex.includes('\\documentclass') && tex.includes('\\begin{document}'),
      { written, head: tex.split('\n').slice(0, 2) }
    );
    check(
      'with the note’s heading as a section of it',
      tex.includes('\\section{Going out}'),
      { section: tex.includes('\\section{Going out}') }
    );

    // The picture: the path pandoc wrote down, un-escaped, is the file the app found.
    // `\pandocbounded{\includegraphics[keepaspectratio,alt={shot}]{the path}}` — the first brace
    // group after the options is the file the writer was handed.
    const written_path = /\\includegraphics\[[^\]]*\]\{([^{}]*)\}/.exec(tex)?.[1] ?? null;
    const unescaped =
      written_path === null ? null : written_path.replace(/\\([#$%&_{}])/g, '$1').trim();
    const there = unescaped === null ? null : await exists(unescaped);
    check(
      'and the picture it refers to is the file the app resolved — spaces, # and % and all',
      unescaped === `${folder}/${picture}` && there === true,
      { written: written_path, unescaped, there }
    );
    check(
      'the citations are resolved and the reference list appended, headed and in the page’s style',
      tex.includes('(Smith, 2020)') &&
        tex.includes('\\section*{References}') &&
        tex.includes('\\bibitem') &&
        tex.includes('Smith, J. (2020)'),
      {
        citation: tex.includes('(Smith, 2020)'),
        heading: tex.includes('\\section*{References}'),
        entry: tex.includes('Smith, J. (2020)')
      }
    );
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      (hint?.textContent ?? '').includes('note.tex'),
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
