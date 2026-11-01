/**
 * The tutorial as the reader meets it: opened from the Help menu, read-only, and replaceable.
 *
 * The menu is native, so the probe emits the event the menu item sends (`tutorial`), exactly as
 * `new-markdown.js` does for its own item. What is checked is the document that arrives — its
 * title and the sections it teaches — that typing and the formatting command do not change it,
 * and that opening a file while it is on screen asks nothing and leaves no "push" behind.
 *
 * @covers src-tauri/src/menu.rs (the Help item and its event), src/ui/tutorial/index.ts,
 *   src/ui/tutorial/index.ts, src/commands/triggers/native_menu.ts,
 *   src/services/session/rules.ts (a read-only document is replaceable)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const registry = await t.app('/src/commands/runtime.ts');
  const i18n = await t.app('/src/services/i18n.ts');
  const { tutorialText } = await t.app('/src/ui/tutorial/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-tutorial-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const note = '# A note beside the tutorial\n\nIts own text.\n';

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

    await invoke('plugin:event|emit', { event: 'tutorial' });
    await sleep(300);
    const current = session.documentSession.current();
    check(
      'Help → Open Tutorial opens the tutorial',
      current?.title === 'Welcome to Yi' && current?.path === null,
      { title: current?.title ?? null, path: current?.path ?? null }
    );
    check('and the session marks it read-only', current?.readOnly === true, current?.readOnly ?? null);
    const savedStatus = document.querySelector('[data-document-saved]');
    check(
      'and the status bar says read-only rather than saved',
      savedStatus?.textContent === 'Read-only',
      savedStatus?.textContent ?? null
    );

    const text = await t.raw();
    check(
      'it teaches the workspace, writing and export',
      ['## ', 'workspace', 'export', '```', '$$'].every((needle) => text.includes(needle)),
      { length: text.length }
    );
    const languageBefore = i18n.language();
    i18n.setLanguage('zh-Hans');
    const chinese = tutorialText();
    i18n.setLanguage(languageBefore);
    check(
      'and the tutorial follows the app’s language',
      chinese.includes('title: 欢迎使用 Yi') && chinese.includes('## 从工作区开始'),
      { title: chinese.split('\n')[1] ?? null }
    );

    // A caret to type at, then a letter that must not reach the document.
    const first = t.blocks()[0];
    if (first) {
      await t.click(first, 0.5);
    }
    const beforeTyping = await t.raw();
    t.key('X');
    await sleep(250);
    const afterTyping = await t.raw();
    check('typing changes nothing', afterTyping === beforeTyping, {
      same: afterTyping === beforeTyping,
      before: beforeTyping.length,
      after: afterTyping.length
    });
    check(
      'and an editing command is refused',
      registry.runCommand('format:bold') === false,
      registry.runCommand('format:bold')
    );

    const prompt = document.querySelector('[data-prompt]');
    const wasPrompted = () =>
      prompt !== null && !prompt.classList.contains('hidden');
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
    check(
      'and that file is now the document on screen',
      afterOpen?.path === notePath,
      { path: afterOpen?.path ?? null }
    );
    check(
      'with the tutorial nowhere in the stack',
      session.documentSession.stack().every((document) => document.readOnly !== true),
      session.documentSession.stack().map((document) => ({ title: document.title, readOnly: document.readOnly }))
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
