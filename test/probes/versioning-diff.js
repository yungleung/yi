/**
 * The sheet: a version of the note in hand, the whole text, with what changed marked.
 *
 * Two versions are made by the app's own command against a real repository in a folder of the
 * probe's own — the second changing one line in the middle — and the panel's row for the *older*
 * one is pressed, so what is compared is a version against the text on screen. The whole note is
 * asserted: every unchanged line is there once, in order, with the changed one marked on both
 * sides.
 *
 * @covers src/ui/versioning/version_diff_view.ts, src/services/text_diff.ts
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
  const folder = `${home}/yi-probe-version-diff`;
  const note = `${folder}/note.md`;
  const config = () => invoke('get_config');
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
  const before = await config();
  const sessionText = await invoke('load_session');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A leftover from a probe that was cut off.
    }
    await files.createEntry(home, 'yi-probe-version-diff', false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);
    await configManager.update({ versioning: true, versioning_workspace: folder });
    await initWorkspaceRepository(folder, false);
    await files.writeTextAtomically(note, 'one\ntwo\nthree\n');
    await commitPaths(folder, [note], 'The note · 2026-10-02 10:00', APP_IDENTITY);
    await files.writeTextAtomically(note, 'one\nTWO\nthree\n');
    await commitPaths(folder, [note], 'The note · 2026-10-02 10:05', APP_IDENTITY);
    await open(note, 'one\nTWO\nthree\n');
    await versionsOfDocument.reread();
    await t.sleep(200);

    // The panel, and the *older* row in it.
    document.querySelector('[data-version-status]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await t.sleep(300);
    const rows = [...document.querySelectorAll('[data-version-row]')];
    check('the panel has the two versions', rows.length === 2, rows.map((row) => row.textContent));
    rows[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.sleep(500);

    const sheet = document.querySelector('[data-version-diff]');
    const shown = sheet !== null && !sheet.classList.contains('hidden');
    check('pressing a row opens the sheet over the editor', shown, {
      shown,
      title: document.querySelector('[data-version-diff-title]')?.textContent ?? null
    });
    const lines = [...document.querySelectorAll('[data-version-diff-line]')].map((row) => ({
      kind: row.getAttribute('data-version-diff-kind'),
      text: row.textContent
    }));
    // The ink of a changed line: the palette's own mixes, not the theme's surface colours — which
    // are the colours a *surface* is painted with and measure under 3:1 as text in the light theme.
    // The arithmetic is `source-theme.js`'s, written again here because a probe stands alone.
    // A changed line wears the palette's own mixes (`--md-source-deleted`/`-inserted`), never the
    // theme's `error`/`success`: those are *surface* colours and measure under 3:1 as text in the
    // light theme (`docs/architecture.md`; `source-theme.js` holds the deletion mix to 3:1 where it
    // is used on a `pre`). The ratios are not measured here — the colours compute to `oklab(…)`,
    // which this probe cannot decode — so what is asserted is that the surface colours are gone.
    const colourWith = (className) => {
      const sample = document.createElement('span');
      sample.className = className;
      document.querySelector('[data-version-diff]')?.appendChild(sample);
      const colour = getComputedStyle(sample).color;
      sample.remove();
      return colour;
    };
    const rowsInk = (kind) =>
      getComputedStyle(document.querySelector(`[data-version-diff-kind="${kind}"]`)).color;
    check(
      'and a change is painted with the palette’s ink, not the theme’s surface colours',
      rowsInk('removed') !== colourWith('text-error') &&
        rowsInk('added') !== colourWith('text-success') &&
        rowsInk('removed') !== rowsInk('added'),
      {
        removed: rowsInk('removed'),
        error: colourWith('text-error'),
        added: rowsInk('added'),
        success: colourWith('text-success')
      }
    );
    check(
      'the whole note is there: what stayed, and the line that changed on both sides',
      lines.length === 4 &&
        lines[0].kind === 'same' &&
        lines[0].text === 'one' &&
        lines[1].kind === 'removed' &&
        lines[1].text === 'two' &&
        lines[2].kind === 'added' &&
        lines[2].text === 'TWO' &&
        lines[3].kind === 'same' &&
        lines[3].text === 'three',
      lines
    );
    const body = document.querySelector('[data-version-diff-body]');
    const changed = document.querySelector('[data-version-diff-kind="removed"]');
    const inView =
      body !== null &&
      changed !== null &&
      changed.getBoundingClientRect().top >= body.getBoundingClientRect().top - 1 &&
      changed.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1;
    check('and it opens at the first change', inView, {
      changed: changed ? Math.round(changed.getBoundingClientRect().top) : null,
      body: body ? [Math.round(body.getBoundingClientRect().top), Math.round(body.getBoundingClientRect().bottom)] : null
    });
    check(
      'the keyboard is with the sheet, not the text behind it',
      sheet !== null && document.activeElement !== null && sheet.contains(document.activeElement),
      { active: document.activeElement?.getAttributeNames?.() ?? null }
    );

    // Escape closes it and the text is untouched — nothing this sheet does writes anywhere.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await t.sleep(300);
    const closed = document.querySelector('[data-version-diff]')?.classList.contains('hidden') === true;
    check(
      'Escape closes it, the text is what it was, and the keyboard is back in it',
      closed &&
        session.documentSession.current()?.content === 'one\nTWO\nthree\n' &&
        document.activeElement?.classList.contains('markdown-scroller') === true,
      {
        closed,
        content: session.documentSession.current()?.content ?? null,
        active: document.activeElement?.className ?? null
      }
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
