/**
 * The seventh kind: the note **as every other export is handed it** — each wikilink written as the
 * words it renders as (the app's pre-process), each citation resolved and its reference list
 * appended (pandoc's citeproc, over the library and style the settings name) — kept as a file of its
 * own for a reader who wants to hand the text to something else.
 *
 * Two things are worth pinning beyond the text: the *name* it is written under is
 * `note.processed.md`, not `note.md` (the default target is the note's own folder and its own name,
 * and an export that writes over the note it is exporting is not one anybody means), and the note's
 * headings keep their own levels — the family's `shift-heading-level-by: 1` is for a *document* whose
 * title sits above its first heading, and would come back here with every heading one deeper.
 *
 * @covers src-tauri/src/export.rs (KINDS' name_suffix), src/ui/export/export_flow.ts (the card's
 *   target from the note's own path), src-tauri/assets/export/export.markdown.yaml
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
  const note = ['# Going out', '', 'A link to [[other|an alias]], and a citation [@smith2020].', ''].join('\n');

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
      'with the citations resolved and their reference list appended, by pandoc’s citeproc',
      plain.includes('(Smith, 2020)') &&
        // The heading citeproc writes carries its own attributes (`# References {#bibliography
        // .unnumbered}`), so what is pinned is the heading's *words*, at whatever level it lands.
        /^#{1,3} References\b/m.test(plain) &&
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
      // precedes it — and the family's `shift-heading-level-by: 1`, which this kind's own file does
      // not carry, would have made it an `##`.
      /^# Going out$/m.test(plain) && !/^#{2,} Going out$/m.test(plain),
      { heading: /^#+ Going out/m.exec(plain)?.[0] ?? null }
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
