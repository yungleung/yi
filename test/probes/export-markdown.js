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
 *   target from the note's own path), test/../assets/export/export.markdown.yaml
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

    await invoke('plugin:event|emit', { event: 'export', payload: null });
    await until(() => open(), 60);
    const veil = card();
    veil.querySelector('[data-export-kind="markdown"]').click();
    await sleep(150);
    check(
      'the processed markdown is written under the note’s own name with .processed, never over it',
      veil.querySelector('[data-export-target]').value === target,
      { target: veil.querySelector('[data-export-target]').value, note: notePath }
    );

    veil.querySelector('[data-export-run]').click();
    const written = await until(() => exists(target));
    const processed = written ? await readText(target) : '';
    check(
      'and the wikilink is written as the words it renders as',
      processed.includes('A link to an alias,') && !processed.includes('[['),
      {
        alias: processed.includes('A link to an alias,'),
        stillSyntax: processed.includes('[[')
      }
    );
    check(
      'with the citations resolved and their reference list appended',
      processed.includes('(Smith, 2020)') &&
        processed.includes('# References') &&
        processed.includes('Smith, J. (2020)'),
      {
        citation: processed.includes('(Smith, 2020)'),
        heading: /^#+ References/m.test(processed),
        entry: processed.includes('Smith, J. (2020)')
      }
    );
    check(
      'and the note’s own headings keep their levels',
      processed.includes('\n# Going out\n'),
      { heading: /^#+ Going out/m.exec(processed)?.[0] ?? null }
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
