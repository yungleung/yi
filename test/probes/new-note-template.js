/**
 * The reader's own default frontmatter, end to end: the config the settings window writes, the
 * note the app then makes, and the tab that would have written it.
 *
 * `new_file_frontmatter` is the template a new note is built from (`services/new_document/index.ts`):
 * the reader's lines are kept where they are, `id` and `date` are stamped over whatever the
 * template says there, and a required key the template leaves out is added. This probe writes a
 * template through the app's config manager, has the tree make a note, and reads the file back.
 *
 * The workspace is the probe's own, at `~/yi-probe-new-note-template`, for the reason
 * `new-markdown.js` gives: the file plugin is scoped to the home directory.
 *
 * @covers src/services/new_document/index.ts, src/ui/new_document/flow.ts
 * @covers src/ui/settings/index.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree/ops.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { NewDocumentSettings } = await t.app('/src/ui/settings/index.ts');
  const { DEFAULT_TEMPLATE } = await t.app('/src/services/new_document/index.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const workspace = `${home}/yi-probe-new-note-template`;
  const stamp = /^\d{14}\.md$/;
  const template = 'title: Untitle\nauthor: me\ndate:\nid:\nkeywords:\n  - untagged';
  const shownTemplate = (tab) => tab.view?.state.doc.toString() ?? null;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) =>
    (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  const read = async (path) => {
    const bytes = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
  };
  const today = (() => {
    const now = new Date();
    const two = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  })();
  /** The session asks before it replaces a document that is not in the stack; this answers. */
  const answerPrompt = async () => {
    const card = document.querySelector('[data-prompt]');
    if (card && !card.classList.contains('hidden')) {
      card.querySelector('[data-prompt-yes]')?.click();
      await t.sleep(250);
    }
  };
  /** A package with metadata may ask first; this reader keeps the app's configured default. */
  const finishTemplateQuestion = async () => {
    const card = document.querySelector('[data-new-document-template-card]');
    if (card && !card.classList.contains('hidden')) {
      card.querySelector('[data-new-document-template-create]')?.click();
      await t.sleep(200);
    }
  };
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-new-note-template', false);
    previous = await t.openWorkspace(workspace);

    await configManager.update({ new_file_frontmatter: null });
    const defaults = new NewDocumentSettings();
    await t.sleep(150);
    const shown = shownTemplate(defaults);
    check(
      'with no template of their own, the editor shows the built-in one',
      shown === DEFAULT_TEMPLATE,
      shown
    );
    await configManager.update({ new_file_frontmatter: template });
    check('the config holds the template that was written', (await invoke('get_config')).new_file_frontmatter, template);
    const tab = new NewDocumentSettings();
    await t.sleep(150);
    check(
      'and the settings tab shows it in its YAML editor',
      shownTemplate(tab),
      template
    );

    await ops.runTreeAction('new-file', entry(workspace, 'workspace', false));
    await t.sleep(400);
    await finishTemplateQuestion();
    await answerPrompt();
    await t.sleep(300);
    const made = (await namesIn(workspace)).filter((name) => stamp.test(name));
    check('a note is made under the generated id', made.length, 1);
    const id = (made[0] ?? '').replace(/\.md$/, '');
    check(
      "and its frontmatter is the reader's template, with the app's stamp written into it",
      made.length > 0 ? await read(`${workspace}/${made[0]}`) : null,
      `---\ntitle: Untitle\nauthor: me\ndate: ${today}\nid: ${id}\nkeywords:\n  - untagged\n---\n\n`
    );
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
