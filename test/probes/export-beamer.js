/**
 * Beamer exports a real PDF from presentation frontmatter and document structure.
 *
 * @covers src-tauri/src/export/kinds.rs,
 *   src/ui/export/kind_family.ts,
 *   src/ui/export/pipeline/preprocess.ts,
 *   src/ui/export/workflow/index.ts
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
  const until = async (ready, tries = 150) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) return true;
      await sleep(100);
    }
    return false;
  };
  const bytesWhenReady = async (path, tries = 50) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const bytes = await bytesOf(path);
      if (bytes !== null) return bytes;
      await sleep(100);
    }
    return null;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-beamer-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/talk.md`;
  const target = `${folder}/talk.pdf`;
  const note = [
    '---',
    'title: Beamer Probe',
    'subtitle: A presentation export',
    'author: Yi',
    'date: 2026-10-29',
    'theme: Madrid',
    'colortheme: seahorse',
    'aspectratio: 169',
    'slide-level: 2',
    '---',
    '',
    '# Section',
    '',
    '## First frame',
    '',
    'A formula $e^{i\\pi}+1=0$ and a citation [@smith2020].',
    '',
    '::: {.callout .callout-tip title="Frame note"}',
    'The callout survives in the slide body.',
    ':::',
    ''
  ].join('\n');

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => card() !== null && !card().classList.contains('hidden');
  const show = async () => {
    const pending = session.documentSession.openFile({ path: notePath, content: note });
    await sleep(200);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await Promise.race([pending, sleep(2000)]);
    await sleep(200);
  };

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A previous cut-off run.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'talk.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await configManager.update({
      bibliography_file: `${window.__probePaths.checkout}test/fixtures/workspace/zotero.bib`
    });
    await show();

    await invoke('plugin:event|emit', { event: 'export', payload: 'beamer' });
    await until(() => open(), 60);
    const veil = card();
    check(
      'Beamer opens its own card with a PDF target',
      veil?.dataset.exportKind === 'beamer' &&
        veil.querySelector('[data-export-target]')?.value === target,
      {
        kind: veil?.dataset.exportKind ?? null,
        target: veil?.querySelector('[data-export-target]')?.value ?? null
      }
    );
    check(
      'Beamer offers no template package or page-size control',
      [...veil.querySelectorAll('div.hidden')].some((row) =>
        row.textContent.includes('Template')
      ) &&
        [...veil.querySelectorAll('div.hidden')].some((row) =>
          row.textContent.includes('Page size')
        ),
      [...veil.querySelectorAll('div.hidden')].map((row) => row.textContent.trim())
    );

    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const wrote = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    const pdf = await bytesWhenReady(target);
    check(
      'Beamer writes a real PDF',
      wrote && pdf !== null && String.fromCharCode(...pdf.slice(0, 5)) === '%PDF-',
      { wrote, size: pdf?.length ?? 0 }
    );
    const text = pdf === null ? '' : await t.pdfText(pdf);
    check(
      'the title frame and slide title are on the page',
      text.includes('BeamerProbe') && text.includes('Firstframe'),
      { text: text.slice(0, 240) }
    );
    check(
      'the frontmatter citation and callout survive',
      text.includes('Smith') && text.includes('Framenote'),
      { text: text.slice(0, 500) }
    );
  } finally {
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
