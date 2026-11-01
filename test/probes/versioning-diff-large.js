/**
 * A large version diff stays inside the history modal: its sidebar remains visible and its right
 * column scrolls, instead of growing the panel past the window.
 *
 * One long version and a current note with a changed middle line make the changed-line jump run
 * against more lines than the panel can show.
 *
 * @covers src/ui/versioning/version_history_modal.ts, src/ui/versioning/version_diff_view.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const { configManager } = await t.app('/src/services/config_manager.ts');
  const { initWorkspaceRepository, commitPaths } = await t.app('/src/api/versioning.ts');
  const { APP_IDENTITY } = await t.app('/src/services/versioning.ts');
  const { versionsOfDocument } = await t.app('/src/services/versions.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folder = `${home}/yi-probe-version-diff-large`;
  const note = `${folder}/note.md`;
  const lines = Array.from({ length: 140 }, (_, index) => `Paragraph ${index + 1} of the long note.`);
  const versionText = `${lines.join('\n')}\n`;
  const current = [...lines];
  current[69] = 'This paragraph differs from the version.';
  const currentText = `${current.join('\n')}\n`;
  const config = () => invoke('get_config');
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(140);
    document.querySelector('[data-prompt-no]')?.click();
    await pending;
    await t.sleep(140);
  };

  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-version-diff-large', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, versionText);
    await commitPaths(folder, [note], 'The long note', APP_IDENTITY);
    await open(note, currentText);
    await versionsOfDocument.reread();

    document.querySelector('[data-version-status]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (document.querySelectorAll('[data-version-diff-line]').length > 100) {
        break;
      }
      await t.sleep(40);
    }

    const modal = document.querySelector('[data-version-history]');
    const panel = document.querySelector('[data-version-history-panel]');
    const sidebar = document.querySelector('[data-version-history-list]');
    const row = document.querySelector('[data-version-row]');
    const diff = document.querySelector('[data-version-diff]');
    const body = document.querySelector('[data-version-diff-body]');
    const panelRect = panel?.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();
    const diffRect = diff?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    check(
      'the large-diff modal still fits inside the window',
      modal !== null &&
        !modal.classList.contains('hidden') &&
        panelRect !== undefined &&
        panelRect !== null &&
        panelRect.top >= 0 &&
        panelRect.bottom <= window.innerHeight + 1,
      panelRect
        ? {
            top: Math.round(panelRect.top),
            bottom: Math.round(panelRect.bottom),
            window: window.innerHeight
          }
        : null
    );
    check(
      'the history sidebar remains beside the diff with its version row visible',
      sidebarRect !== undefined &&
        sidebarRect !== null &&
        rowRect !== undefined &&
        rowRect !== null &&
        diffRect !== undefined &&
        diffRect !== null &&
        sidebarRect.width >= 200 &&
        sidebarRect.height > 0 &&
        rowRect.height > 0 &&
        sidebarRect.right <= diffRect.left + 1 &&
        rowRect.top >= panelRect.top &&
        rowRect.bottom <= panelRect.bottom,
      {
        sidebar: sidebarRect ? { width: sidebarRect.width, height: sidebarRect.height } : null,
        row: rowRect ? { top: rowRect.top, bottom: rowRect.bottom } : null,
        diff: diffRect ? { left: diffRect.left, top: diffRect.top } : null
      }
    );
    check(
      'the diff right column has a bounded scroll area',
      body !== null &&
        bodyRect !== undefined &&
        bodyRect !== null &&
        bodyRect.height > 0 &&
        bodyRect.bottom <= (panelRect?.bottom ?? 0) + 1 &&
        body.scrollHeight > body.clientHeight,
      bodyRect
        ? {
            height: Math.round(bodyRect.height),
            bottom: Math.round(bodyRect.bottom),
            panelBottom: panelRect ? Math.round(panelRect.bottom) : null,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight
          }
        : null
    );
    if (body !== null) {
      body.scrollTop = body.scrollHeight;
    }
    check(
      'and the diff can scroll without moving the modal',
      body !== null &&
        body.scrollTop > 0 &&
        document.querySelector('[data-version-history]')?.classList.contains('hidden') === false,
      { scrollTop: body?.scrollTop ?? null }
    );
  } finally {
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
