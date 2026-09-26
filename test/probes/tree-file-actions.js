/**
 * The tree's menu items for an entry that is already there: Reveal in folder, the three
 * copies, and Delete — which asks first.
 *
 * The menu is native and nothing but a person can choose an item of it
 * (`docs/testing.md`), so the *contents* are held by `check-tree-menu.mjs` and the actions
 * are driven here through `tree_ops.ts`, the module the menu's items run. The native
 * dialog that asks about the delete, and the opener that reveals a file, are stood in for
 * through the page's `fetch`, the way `footnote-preview.js` stands in for the opener, so a
 * probe never opens a dialog or a file manager.
 *
 * The probe makes its own workspace under `/private/tmp` with the app's own commands and
 * removes it again; the note it copies an id from is one of the fixtures, read but never
 * written.
 *
 * @covers src/ui/workspace/tree_ops.ts, src/services/document_manager.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const workspace = '/private/tmp/yi-tree-actions-probe';
  const sub = `${workspace}/sub`;
  const inner = `${sub}/inner.md`;
  const entry = (path, basename, isFile) => ({ path, basename, isFile });
  const namesIn = async (folder) => (await files.listFolderFiles(folder)).map((item) => item.basename).sort();
  /** The workspace the app was opened on: the fixtures, where the id-carrying note is. */
  const started = await window.__TAURI_INTERNALS__.invoke('get_config');
  const withId = `${started?.workspace ?? ''}/notes/Essays/Language and Thought.md`;
  /** What the probe answers for the backend, and what the backend was asked for. */
  const answer = { dialog: true, calls: [] };
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = decodeURIComponent(
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    );
    const body = String(init?.body ?? '');
    if (url.includes('plugin:dialog|ask')) {
      answer.calls.push({ url, body });
      return new Response(String(answer.dialog), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    if (url.includes('plugin:opener|reveal_item_in_dir')) {
      answer.calls.push({ url, body });
      return new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    return await realFetch.call(window, input, init);
  };
  const copied = [];
  const realClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => copied.push(String(text)) }
  });
  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry('/private/tmp', 'yi-tree-actions-probe', false);
    await files.createEntry(workspace, 'sub', false);
    await files.createEntry(sub, 'inner.md', true);
    previous = await t.openWorkspace(workspace);

    answer.calls.length = 0;
    await ops.runTreeAction('reveal', entry(inner, 'inner.md', true));
    await t.sleep(120);
    check(
      'Reveal in folder asks the system to show the entry',
      answer.calls.some((call) => call.url.includes('reveal_item_in_dir') && call.body.includes(inner)),
      answer.calls
    );

    await ops.runTreeAction('copy-path', entry(inner, 'inner.md', true));
    await ops.runTreeAction('copy-name', entry(inner, 'inner.md', true));
    check(
      'Copy path puts the path, and Copy name the name without its extension',
      copied,
      [inner, 'inner']
    );
    copied.length = 0;
    await ops.runTreeAction('copy-name', entry(`${workspace}/sub`, 'sub', false));
    check('and a folder is copied as the name it has', copied, ['sub']);
    copied.length = 0;
    await ops.runTreeAction('copy-id', entry(withId, 'Language and Thought.md', true));
    await t.sleep(120);
    check('Copy id puts the frontmatter id on the clipboard', copied, ['20240707122715']);
    copied.length = 0;
    await ops.runTreeAction('copy-id', entry(inner, 'inner.md', true));
    await t.sleep(120);
    check('and a note with no id copies nothing', copied, []);

  } finally {
    window.fetch = realFetch;
    if (realClipboard) {
      Object.defineProperty(Navigator.prototype, 'clipboard', realClipboard);
    }
    delete navigator.clipboard;
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
