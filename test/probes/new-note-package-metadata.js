/**
 * A new note can take its starting metadata from one package without remembering that choice.
 *
 * The menu path is driven through the card: the package is chosen beside the folder and name, the
 * file is written, and the app's date and id are stamped over the package's values. The tree path is
 * then asked its smaller template-only question and explicitly chooses no template, proving the
 * choice is local to each note rather than stored in config.
 *
 * @covers src/services/new_document.ts, src/services/new_document_templates.ts
 * @covers src/ui/new_document/new_document_dialog.ts, src/ui/new_document/new_document_flow.ts
 * @covers src/ui/new_document/template_picker.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const api = await t.app('/src/api/templates.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checkout = window.__probePaths.checkout;
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const stamp = Date.now().toString(36);
  const folderName = `yi-probe-new-note-package-${stamp}`;
  const workspace = `${home}/${folderName}`;
  const notes = `${workspace}/Notes`;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) =>
    (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const visible = (selector) => {
    const element = document.querySelector(selector);
    return element !== null && !element.classList.contains('hidden');
  };
  const until = async (ready, tries = 100) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (ready()) return true;
      await t.sleep(50);
    }
    return false;
  };
  const answerSessionPrompt = async () => {
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
  };
  let previous = null;
  let templateId = null;
  const readerTemplate =
    'title: Default title\nauthor: Default author\ndate:\nid:\nkeywords:\n  - untagged\nreviewed: false';
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a run the bridge cut off.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(workspace, 'Notes', false);
    previous = await t.openWorkspace(workspace);
    await configManager.update({ new_file_frontmatter: readerTemplate });
    const pkg = await api.importTemplate({
      source: `${checkout}test/fixtures/templates/new-note-kit`,
      name: `New note package ${stamp}`,
      kind: 'html',
      entry: 'template/page.html',
      source_url: null,
      license: null,
      map_title: false,
      map_author: false
    });
    templateId = pkg.id;

    await invoke('plugin:event|emit', { event: 'new_markdown' });
    await until(() => visible('[data-new-document]'));
    const card = document.querySelector('[data-new-document]');
    const choice = card.querySelector('[data-new-document-template]');
    check(
      'the new-note card offers the package that has metadata',
      [...choice.options].some((option) => option.value === pkg.id),
      [...choice.options].map((option) => option.textContent)
    );
    check(
      'and its first answer is no template',
      choice.options[0]?.value === '',
      ''
    );
    card.querySelector(`[data-new-document-folder="${notes}"]`).click();
    card.querySelector('[data-new-document-name]').value = 'from package';
    choice.value = pkg.id;
    card.querySelector('[data-new-document-create]').click();
    await t.sleep(400);
    await answerSessionPrompt();
    await t.sleep(200);

    const packaged = await read(`${notes}/from package.md`);
    check(
      'the package metadata wins over the reader default and supplies its order',
      packaged.startsWith(
        '---\ntitle: Template title\nauthor: Template Author\ndate: '
      ),
      packaged
    );
    check(
      'the app stamps its own date and id over the package values',
      /^date: \d{4}-\d{2}-\d{2}$/m.test(packaged) &&
        /^id: \d{14}$/m.test(packaged) &&
        !packaged.includes('1999-01-01') &&
        !packaged.includes('old-template-id'),
      packaged
    );
    check(
      'keys only the reader default has are still present',
      packaged.includes('reviewed: false') && packaged.includes('category:\n  name: article'),
      packaged
    );
    check(
      'the title is selected in the opened note',
      (window.getSelection()?.toString() ?? null) === 'Template title',
      window.getSelection()?.toString() ?? null
    );

    await ops.runTreeAction('new-file', entry(notes, 'Notes', false));
    await until(() => visible('[data-new-document-template-card]'));
    const picker = document.querySelector('[data-new-document-template-card]');
    check(
      'the tree asks the smaller template-only question',
      picker.querySelector('[data-new-document-template]') !== null &&
        !picker.querySelector('[data-new-document-folder]'),
      picker.outerHTML.slice(0, 120)
    );
    picker.querySelector('[data-new-document-template]').value = '';
    picker.querySelector('[data-new-document-template-create]').click();
    await t.sleep(400);
    await answerSessionPrompt();
    await t.sleep(200);
    const made = (await namesIn(notes)).filter((name) => /^\d{14}\.md$/.test(name));
    const plain = made.length > 0 ? await read(`${notes}/${made[0]}`) : '';
    check(
      'the next note uses the reader default because the package choice was local',
      plain.includes('title: Default title') &&
        plain.includes('author: Default author') &&
        plain.includes('reviewed: false'),
      plain
    );
  } finally {
    if (templateId !== null) {
      try {
        await api.removeTemplate(templateId);
      } catch {
        // The package a failed import never made.
      }
    }
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
