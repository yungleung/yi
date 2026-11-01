/**
 * One item per kind, and every item opens the card it names.
 *
 * The File menu's *Export* is a **submenu** — one item per kind the app ships, each naming its own
 * (`src-tauri/src/menu/build.rs`, over `KINDS`) — and the half of it a probe can see is the event those
 * items emit: `export` carrying the kind. So this walks the kinds the app reports, asks for each the
 * way its menu item does, and checks that the card that opens is *about* that kind: its own name in
 * the heading, its own target under the note's own name (`a note.processed.md` for the markdown kind,
 * whose output would otherwise be the note itself).
 *
 * It is its own probe rather than a corner of `export-docx.js` because the bridge gives one script
 * five seconds: seven cards opened one after another, ahead of a real export, is longer than that —
 * and a probe still running when the bridge gives up keeps driving the page while the *next* probe
 * tries to measure it (measured: the four probes after it failed).
 *
 * @covers src-tauri/src/menu/build.rs (the submenu), src/ui/export/workflow/index.ts (the kind the payload
 *   names), src/ui/export/dialog/index.ts (a card that is about one kind), src-tauri/src/export.rs
 *   (KINDS' name_suffix)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const api = await t.app('/src/api/export.ts');
  const i18n = await t.app('/src/services/i18n.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-kinds-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const note = '# Going out\n\nA note, for the menu to have something to export.\n';

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
    const pending = session.documentSession.openFile({ path: notePath, content: note });
    await sleep(200);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await pending;
    await sleep(200);

    const reached = [];
    for (const info of (await api.exportKinds()).kinds) {
      await invoke('plugin:event|emit', { event: 'export', payload: info.kind });
      let seen = null;
      for (let attempt = 0; attempt < 60 && seen === null; attempt += 1) {
        if (open() && card().dataset.exportKind === info.kind) {
          seen = {
            kind: card().dataset.exportKind,
            heading: card().querySelector('p')?.textContent ?? null,
            target: card().querySelector('[data-export-target]')?.value ?? null,
            expected:
              info.kind === 'html' || info.kind === 'revealjs'
                ? `${folder}/note`
                : `${folder}/note${info.name_suffix}.${info.extension}`
          };
        } else {
          await sleep(25);
        }
      }
      reached.push({ kind: info.kind, ...(seen ?? { kind: null }) });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(150);
    }
    check(
      'every kind the app ships opens the card it names, under the note’s own name',
      reached.length > 0 &&
        reached.every((entry) => entry.kind !== null && entry.target === entry.expected),
      reached
    );
    check(
      'and each card says which kind it is about, in the reader’s words',
      reached.every((entry) => (entry.heading ?? '').includes(i18n.t('export.title'))),
      reached.map((entry) => entry.heading)
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
