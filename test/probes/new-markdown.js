/**
 * Making a new note: the card the menu's command opens, and the tree's own *New file*.
 *
 * The menu item is native and nothing but a person can choose it (`docs/testing.md`), so the
 * command it names — `file:newMarkdown`, mapped in `commands/menu.ts` — is run here, which is
 * what the menu's own event does. Everything after that is driven for real: the card's folder
 * rows are clicked, the name field is typed into, Create is pressed, and the session's question
 * about the document on screen is answered on its card.
 *
 * The workspace is the probe's own, at `~/yi-probe-new-markdown`: the app's file plugin is
 * scoped to the home directory (`src-tauri/capabilities/default.json` — a workspace outside it
 * cannot be read *or* written by the webview, which is why this probe cannot use
 * `/private/tmp` the way the tree's own probes do), and the home directory is not watched by
 * the dev server. It is removed again either way.
 *
 * @covers src/ui/new_document/new_document_flow.ts, src/ui/new_document/new_document_dialog.ts
 * @covers src/services/new_document.ts, src/services/workspace_folders.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const registry = await t.app('/src/ui/markdown/commands/registry.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-new-markdown`;
  const notes = `${workspace}/Notes`;
  const stamp = /^\d{14}\.md$/;
  const frontmatter =
    /^---\ntitle: Untitle\ndate: \d{4}-\d{2}-\d{2}\nid: (\d{14})\nkeywords: untagged\n---\n\n$/;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) =>
    (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const rows = () =>
    [...document.querySelectorAll('[data-new-document-folder]')].map((row) =>
      row.getAttribute('data-new-document-folder')
    );
  const chosen = () =>
    document
      .querySelector('[data-new-document-folder][aria-pressed="true"]')
      ?.getAttribute('data-new-document-folder') ?? null;
  const cardIsOpen = () =>
    document.querySelector('[data-new-document]')?.classList.contains('hidden') === false;
  /** The session asks before it replaces a document that is not in the stack; this answers. */
  const answerPrompt = async () => {
    const card = document.querySelector('[data-prompt]');
    if (card && !card.classList.contains('hidden')) {
      card.querySelector('[data-prompt-yes]')?.click();
      await t.sleep(250);
    }
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-new-markdown', false);
    await files.createEntry(workspace, 'Notes', false);
    previous = await t.openWorkspace(workspace);

    // --- the menu's own event: where and what, asked on a card ---
    check(
      'the command the menu item names is registered',
      registry.registeredCommands().some((command) => command.id === 'file:newMarkdown'),
      registry.registeredCommands().map((command) => command.id)
    );
    // The Rust menu emits this event; `commands/menu.ts` is the one place that says which
    // command it means, and the editor is the one that hears it.
    await invoke('plugin:event|emit', { event: 'new_markdown' });
    await t.sleep(350);
    const card = document.querySelector('[data-new-document]');
    check('and it opens the card', cardIsOpen(), card?.outerHTML?.slice(0, 70) ?? null);
    const field = card?.querySelector('[data-new-document-name]');
    check('the name field opens on the generated id', /^\d{14}$/.test(field?.value ?? ''), field?.value ?? null);
    check(
      'with the whole of it selected, ready to be typed over',
      document.activeElement === field &&
        field.selectionStart === 0 &&
        field.selectionEnd === (field.value ?? '').length,
      { focused: document.activeElement === field, start: field?.selectionStart, end: field?.selectionEnd }
    );
    check('the workspace folders are offered, the root first', rows(), [workspace, notes]);
    check(
      'and the one chosen is the folder of the document on screen — here, the root of the new workspace',
      chosen(),
      workspace
    );

    card.querySelector(`[data-new-document-folder="${notes}"]`).click();
    await t.sleep(80);
    check('choosing another folder moves the choice', chosen(), notes);
    field.value = 'probe note';
    card.querySelector('[data-new-document-create]').click();
    await t.sleep(350);
    await answerPrompt();
    await t.sleep(250);

    check('the note is written into the chosen folder, under the name given', await namesIn(notes), [
      'probe note.md'
    ]);
    const written = await read(`${notes}/probe note.md`);
    check('holding the frontmatter of a new note', frontmatter.test(written), written);
    const title = caret.getSelectionRange()?.toString() ?? null;
    check('the note is the document on screen with its title selected', title, 'Untitle');
    check(
      'and the selection is the one the browser holds, so a keystroke lands on it',
      window.getSelection()?.toString() ?? null,
      'Untitle'
    );
    t.key('Z');
    await t.sleep(200);
    const typed = await t.raw();
    check(
      'a keystroke replaces the whole default title',
      /^---\ntitle: Z\n/m.test(typed) && !typed.includes('Untitle'),
      typed
    );
    check('and what is on screen is the note the file holds, with the title typed over', typed, written.replace('title: Untitle', 'title: Z'));

    // --- the tree's own New file: the row is the place, so there is nothing to ask ---
    document.querySelector(`[data-tree-path="${notes}"]`)?.click();
    await t.sleep(250);
    await ops.runTreeAction('new-file', entry(notes, 'Notes', false));
    await t.sleep(350);
    await answerPrompt();
    await t.sleep(250);
    const made = (await namesIn(notes)).filter((name) => stamp.test(name));
    check('the tree makes its note inside the folder of the row that was clicked', made.length, 1);
    const madeText = made.length > 0 ? await read(`${notes}/${made[0]}`) : '';
    check('named after the generated id', made[0] ?? null, `${madeText.match(frontmatter)?.[1] ?? ''}.md`);
    check('and holding the same new note', frontmatter.test(madeText), madeText);
    check(
      'the tree does not open its name for editing — the file is named, the title is what is typed',
      document.querySelector(`[data-tree-path="${notes}/${made[0]}"] span.truncate`)?.isContentEditable !==
        true,
      document.querySelector(`[data-tree-path="${notes}/${made[0]}"] span.truncate`)?.outerHTML ?? null
    );
    check('and it is opened with its title selected', caret.getSelectionRange()?.toString() ?? null, 'Untitle');
  } finally {
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
