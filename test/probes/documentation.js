/**
 * The Help menu’s Documentation item as a reader meets it.
 *
 * The native menu is out of a probe’s reach, so this emits the event its item sends. The document
 * must arrive pathless and read-only, carry the template-authoring guide, refuse typing, and be
 * replaceable by an ordinary file without a session question.
 *
 * @covers src-tauri/src/menu.rs (Documentation and F1), src/ui/documentation/documentation_flow.ts,
 *   src/ui/documentation/documentation_text.ts, src/ui/markdown/commands/menu.ts,
 *   src/services/session_rules.ts (a read-only document is replaceable)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const registry = await t.app('/src/ui/markdown/commands/registry.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-documentation-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const note = '# A note after the documentation\n\nIts own text.\n';
  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a run the bridge cut off.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);

    check(
      'the Documentation command is registered',
      registry.registeredCommands().some((command) => command.id === 'help:documentation'),
      registry.registeredCommands().map((command) => command.id)
    );

    await invoke('plugin:event|emit', { event: 'documentation' });
    await sleep(350);
    const current = session.documentSession.current();
    check(
      'Help → Documentation opens the guide',
      current?.title === 'Yi Documentation' && current?.path === null,
      { title: current?.title ?? null, path: current?.path ?? null }
    );
    check('and the session marks it read-only', current?.readOnly === true, current?.readOnly ?? null);
    const savedStatus = document.querySelector('[data-document-saved]');
    check(
      'the status bar says read-only',
      savedStatus?.textContent === 'Read-only',
      savedStatus?.textContent ?? null
    );

    const text = await t.raw();
    check(
      'it explains the missing LaTeX installation',
      ['## Install Pandoc and TeX', 'TeX Live', 'MacTeX', 'MiKTeX', 'xelatex --version'].every(
        (needle) => text.includes(needle)
      ),
      { length: text.length }
    );
    check(
      'it contains the package authoring chapters',
      [
        '## Template packages',
        '## Package YAML',
        '## Author HTML templates',
        '## Author LaTeX and PDF templates',
        '### Native BibTeX source',
        '## Author EPUB templates',
        '## Author Word and OpenDocument templates',
        '## Package checklist'
      ].every((needle) => text.includes(needle)),
      { length: text.length }
    );
    check(
      'it gives an AI-agent prompt for every finished template example',
      [
        '#### Example prompt: HTML',
        '#### Example prompt: LaTeX',
        '#### Example prompt: PDF',
        '#### Example prompt: Rho Class PDF',
        '#### Example prompt: EPUB',
        '#### Example prompt: Word',
        '#### Example prompt: OpenDocument'
      ].every((needle) => text.includes(needle)),
      { length: text.length }
    );
    check(
      'it explains when a complete LaTeX sample needs wrapper mode',
      text.includes('### Wrapper mode') &&
        text.includes('complete LaTeX document') &&
        text.includes('no `$body$`'),
      { length: text.length }
    );
    const rendered = t.prose();
    check(
      'it links to Pandoc’s reference-document workflow and shows both commands',
      text.includes('### Start from Pandoc’s reference document') &&
        text.includes('(https://pandoc.org/MANUAL.html#option--reference-doc)') &&
        text.includes(
          'pandoc -o custom-reference.docx --print-default-data-file reference.docx'
        ) &&
        text.includes('pandoc -o custom-reference.odt --print-default-data-file reference.odt'),
      { length: text.length }
    );
    check(
      'the guide renders its headings, tables and examples',
      rendered.querySelectorAll('h2, h3').length >= 4 &&
        rendered.querySelectorAll('table').length >= 1 &&
        rendered.querySelectorAll('pre').length >= 2,
      {
        headings: rendered.querySelectorAll('h2, h3').length,
        tables: rendered.querySelectorAll('table').length,
        examples: rendered.querySelectorAll('pre').length
      }
    );
    check(
      'and the guide needs no pictures from the reader’s workspace',
      rendered.querySelectorAll('img').length === 0,
      rendered.querySelectorAll('img').length
    );
    // A restored reference may be an older copy than the bundle that shipped with this run.
    const stale = session.documentSession.current();
    if (stale !== null) stale.content += '\nSTALE DOCUMENTATION\n';
    await invoke('plugin:event|emit', { event: 'documentation' });
    await sleep(300);
    check(
      'reopening Documentation refreshes a restored read-only copy',
      !(await t.raw()).includes('STALE DOCUMENTATION') &&
        (await t.raw()).includes('### Wrapper mode'),
      { length: (await t.raw()).length }
    );

    const first = t.blocks()[0];
    if (first) await t.click(first, 0.5);
    const beforeTyping = await t.raw();
    t.key('X');
    await sleep(250);
    check('typing changes nothing', (await t.raw()) === beforeTyping);
    check(
      'and an editing command is refused',
      registry.runCommand('format:bold') === false,
      registry.runCommand('format:bold')
    );

    const prompt = document.querySelector('[data-prompt]');
    const wasPrompted = () => prompt !== null && !prompt.classList.contains('hidden');
    const opened = session.documentSession.openFile({ path: notePath, content: note });
    let asked = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(50);
      if (wasPrompted()) {
        asked = true;
        prompt.querySelector('[data-prompt-no]')?.click();
        break;
      }
    }
    await Promise.race([opened, sleep(1000)]);
    const afterOpen = session.documentSession.current();
    check('opening another file asks nothing', asked === false, asked);
    check('and that file becomes the document on screen', afterOpen?.path === notePath, {
      path: afterOpen?.path ?? null
    });
    check(
      'with Documentation nowhere in the stack',
      session.documentSession.stack().every((document) => document.readOnly !== true),
      session.documentSession.stack().map((document) => ({
        title: document.title,
        readOnly: document.readOnly
      }))
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
