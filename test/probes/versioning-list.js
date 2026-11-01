/**
 * The history modal: the versions on the left, newest first, and the selected diff on the right.
 *
 * The versions are made by the app's own command (`commitPaths`) against a real repository in a
 * folder of the probe's own, and the modal is opened by pressing the button the reader presses —
 * so what is asserted is the list a reader would see, not a shape built for the test.
 *
 * @covers src/ui/versioning/index.ts, src/services/versioning/versions.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning/index.ts');
  const { versionsOfDocument } = await t.app('/src/services/versioning/index.ts');
  const { t: words } = await t.app('/src/services/i18n.ts');
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
  /** Whether the modal is showing: neither it nor an ancestor is hidden. */
  const modalUp = () => {
    let node = document.querySelector('[data-version-history]');
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
    for (let attempt = 0; attempt < 40 && !modalUp(); attempt += 1) {
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
    const modal = document.querySelector('[data-version-history]');
    const panel = document.querySelector('[data-version-history-panel]');
    const listPane = document.querySelector('[data-version-history-list]');
    const diff = document.querySelector('[data-version-diff]');
    const modalRect = modal?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const listRect = listPane?.getBoundingClientRect();
    const diffRect = diff?.getBoundingClientRect();
    check(
      'pressing the status button opens a centered history modal',
      modalUp() &&
        modal?.classList.contains('fixed') === true &&
        modalRect !== undefined &&
        modalRect !== null &&
        panelRect !== undefined &&
        panelRect !== null &&
        panelRect.left >= 0 &&
        panelRect.top >= 0 &&
        panelRect.right <= window.innerWidth &&
        panelRect.bottom <= window.innerHeight &&
        document.querySelector('[data-version-history-title]')?.textContent ===
          words('version.history.title'),
      {
        panel: panelRect
          ? {
              left: Math.round(panelRect.left),
              top: Math.round(panelRect.top),
              right: Math.round(panelRect.right),
              bottom: Math.round(panelRect.bottom)
            }
          : null,
        window: { width: window.innerWidth, height: window.innerHeight },
        title: document.querySelector('[data-version-history-title]')?.textContent ?? null
      }
    );
    check(
      'and the modal holds a history sidebar beside the selected diff',
      listRect !== undefined &&
        listRect !== null &&
        diffRect !== undefined &&
        diffRect !== null &&
        listRect.right <= diffRect.left + 1 &&
        Math.abs(listRect.top - diffRect.top) <= 1 &&
        diffRect.right <= (panelRect?.right ?? 0) + 1,
      {
        list: listRect
          ? {
              left: Math.round(listRect.left),
              right: Math.round(listRect.right),
              top: Math.round(listRect.top)
            }
          : null,
        diff: diffRect
          ? {
              left: Math.round(diffRect.left),
              right: Math.round(diffRect.right),
              top: Math.round(diffRect.top)
            }
          : null
      }
    );
    check(
      'the history sidebar lists the note’s versions, the newest first',
      rows.length === 2 &&
        subjectOf(rows[0]) === 'The note' &&
        subjectOf(rows[1]) === 'The note',
      rows.map(subjectOf)
    );
    check(
      'and selects the newest one, with its comment under it and under no other',
      rows[0]?.getAttribute('data-version-latest') === 'true' &&
        rows[0]?.getAttribute('data-version-selected') === 'true' &&
        rows[0]?.getAttribute('aria-pressed') === 'true' &&
        commentOf(rows[0]) === 'why I rewrote it' &&
        commentOf(rows[1]) === null,
      {
        latest: rows[0]?.getAttribute('data-version-latest') ?? null,
        selected: rows[0]?.getAttribute('data-version-selected') ?? null,
        pressed: rows[0]?.getAttribute('aria-pressed') ?? null,
        comments: rows.map(commentOf)
      }
    );
    check(
      'and the right column already shows the selected version’s diff',
      diff !== null &&
        !diff.classList.contains('hidden') &&
        (document.querySelector('[data-version-diff-title]')?.textContent ?? '').includes(
          rows[0]?.querySelector('[data-version-stamp]')?.textContent ?? ''
        ),
      {
        title: document.querySelector('[data-version-diff-title]')?.textContent ?? null,
        latest: rows[0]?.querySelector('[data-version-stamp]')?.textContent ?? null
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
    document.querySelector('[data-version-history-close]')?.click();
    await t.sleep(120);
    check(
      'and its close button dismisses the modal and returns the keyboard to the note',
      modal?.classList.contains('hidden') === true &&
        document.activeElement !== null &&
        t.scroller().contains(document.activeElement),
      {
        hidden: modal?.classList.contains('hidden') ?? null,
        active: document.activeElement?.className ?? null
      }
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
