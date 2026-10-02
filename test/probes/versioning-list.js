/**
 * The panel: the versions of the note on screen, newest first, with a comment under its own row.
 *
 * The versions are made by the app's own command (`commitPaths`) against a real repository in a
 * folder of the probe's own, and the panel is opened by pressing the button the reader presses —
 * so what is asserted is the list a reader would see, not a shape built for the test.
 *
 * @covers src/ui/versioning/versions_panel.ts, src/services/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-list`;
  const note = `${folder}/note.md`;
  const config = () => invoke('get_config');
  /** Opens a note through the session, declining the question a replaced document may raise. */
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(140);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await t.sleep(140);
  };
  /** Whether the panel is showing: nothing between the list and the page is hidden. */
  const panelUp = () => {
    let node = document.querySelector('[data-version-list]');
    if (node === null) {
      return false;
    }
    while (node !== null) {
      if (node.classList?.contains('hidden')) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };
  const press = async () => {
    document.querySelector('[data-version-status]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    for (let attempt = 0; attempt < 40 && !panelUp(); attempt += 1) {
      await t.sleep(40);
    }
    await t.sleep(200);
  };

  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-version-list', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, 'The first text.\n');
    await commitPaths(folder, [note], 'The note · 2026-10-01 20:15', APP_IDENTITY);
    await files.writeTextAtomically(note, 'The second text.\n');
    await commitPaths(folder, [note], 'The note · 2026-10-01 20:16', APP_IDENTITY, 'why I rewrote it');
    await open(note, 'The second text.\n');
    await versionsOfDocument.reread();
    await t.sleep(200);

    await press();
    const rows = [...document.querySelectorAll('[data-version-row]')];
    const subjectOf = (row) => row.querySelector('[data-version-subject]')?.textContent ?? null;
    const commentOf = (row) => row.querySelector('[data-version-comment-text]')?.textContent ?? null;
    // Where it is, not just whether it is unhidden: the status bar is the bottom strip of the
    // window, so a panel hung below it would be off-screen with every class saying otherwise.
    const host = document.querySelector('[data-version-list]')?.closest('.absolute');
    const hostRect = host?.getBoundingClientRect();
    const buttonRect = document.querySelector('[data-version-status]')?.getBoundingClientRect();
    const middle =
      hostRect === undefined || hostRect === null
        ? null
        : {
            x: Math.round(hostRect.left + hostRect.width / 2),
            y: Math.round(hostRect.top + hostRect.height / 2)
          };
    const overThePanel = middle === null ? null : document.elementFromPoint(middle.x, middle.y);
    check(
      'and it opens above the button, inside the window, with nothing over it',
      hostRect !== undefined &&
        hostRect !== null &&
        buttonRect !== undefined &&
        buttonRect !== null &&
        hostRect.top >= 0 &&
        hostRect.bottom <= window.innerHeight &&
        hostRect.bottom <= buttonRect.top + 1 &&
        overThePanel !== null &&
        host?.contains(overThePanel) === true,
      {
        host: hostRect ? { top: Math.round(hostRect.top), bottom: Math.round(hostRect.bottom) } : null,
        button: buttonRect ? { top: Math.round(buttonRect.top) } : null,
        window: { height: window.innerHeight },
        overThePanel: overThePanel?.getAttributeNames?.() ?? null
      }
    );
    check(
      'the panel lists the note’s versions, the newest first',
      rows.length === 2 &&
        subjectOf(rows[0]) === 'The note · 2026-10-01 20:16' &&
        subjectOf(rows[1]) === 'The note · 2026-10-01 20:15',
      rows.map(subjectOf)
    );
    check(
      'and marks the newest one, with its comment under it and under no other',
      rows[0]?.getAttribute('data-version-latest') === 'true' &&
        commentOf(rows[0]) === 'why I rewrote it' &&
        commentOf(rows[1]) === null,
      {
        latest: rows[0]?.getAttribute('data-version-latest') ?? null,
        comments: rows.map(commentOf)
      }
    );
    check(
      'each row carries the stamp of its own commit',
      rows.every((row) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(
          row.querySelector('[data-version-stamp]')?.textContent ?? ''
        )
      ),
      rows.map((row) => row.querySelector('[data-version-stamp]')?.textContent ?? null)
    );
    // A row is pressable, and says so: the cursor is a computed fact, and the hover tint is a class
    // (a probe cannot put a pointer on anything, so the class is what can be held).
    check(
      'and the rows say they can be pressed: a pointer, and a tint for the mouse',
      rows.every(
        (row) =>
          getComputedStyle(row).cursor === 'pointer' &&
          row.classList.contains('hover:bg-base-300')
      ),
      rows.map((row) => ({ cursor: getComputedStyle(row).cursor, className: row.className }))
    );
  } finally {
    await config(); // no-op, so the finally always has something to await first
    await t.restoreWorkspace(before);
    if (sessionText !== null) {
      await invoke('save_session', { session: sessionText });
    }
    await session.documentSession.load();
    await t.sleep(120);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Already gone.
    }
  }
  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
