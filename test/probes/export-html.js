/**
 * The fourth kind, and the one whose promise is "one file".
 *
 * `self-contained: true` (Zettlr's) is what makes an HTML export a document a reader can move,
 * email or open anywhere: the note's picture is *carried* rather than linked, and the stylesheet is
 * in the head rather than in a folder beside it. So that is what this probe looks at first — the
 * picture as a `data:image/png;base64` URL and a `<style>` in the file — and then at the rest of a
 * document: the heading, the math (MathJax marks it; the script is a CDN link, which is the one
 * thing that leaves the file, and the asset's header says so), and the citations as a reference list
 * in the page's style. The picture is one the app *fetched from the web* for this run, which is the
 * second thing worth proving here: a page with a web picture comes out whole even on a pandoc that
 * cannot fetch anything itself.
 *
 * @covers src-tauri/src/export/kinds.rs (KINDS), src-tauri/src/export/run.rs (pandoc_arguments),
 *   src/ui/export/export_dialog.ts
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
  const target = `${folder}/note.html`;
  const url = `${window.__probeHttpBase}/image.png`;
  const note = [
    '# Going out',
    '',
    `A picture from the web: ![shot](${url}), math $e^{i\\pi}$, and a citation [@smith2020].`,
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
      'the menu’s html item opens the card for the HTML kind, and the target becomes a .html',
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
    const page = written ? await readText(target) : '';
    check(
      'Export writes a whole HTML document',
      page.includes('<!DOCTYPE html>') && page.includes('<html'),
      { written, head: page.split('\n').slice(0, 2) }
    );
    check(
      'with the note’s heading, shifted the way the file says',
      page.includes('<h2 id="going-out">Going out</h2>') || page.includes('<h2>Going out</h2>'),
      { heading: /<h2[^>]*>Going out/.exec(page)?.[0] ?? null }
    );
    check(
      'and it is one file: the picture it fetched from the web is carried in it, not linked',
      page.includes('src="data:image/png;base64,') && page.includes('<style'),
      {
        carried: page.includes('src="data:image/png;base64,'),
        style: page.includes('<style'),
        linked: page.includes(`src="${url}`)
      }
    );
    check(
      'the math is marked for MathJax rather than left as raw text',
      page.includes('class="math inline"') && /<script[^>]*mathjax[^>]*>/i.test(page),
      {
        marked: page.includes('class="math inline"'),
        script: /<script[^>]*mathjax[^>]*>/i.exec(page)?.[0]?.slice(0, 60) ?? null
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
    const hint = [...document.querySelectorAll('[data-hint] [data-hint-text]')].at(-1);
    check(
      'and the reader is told which file it wrote',
      (hint?.textContent ?? '').includes('note.html'),
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
