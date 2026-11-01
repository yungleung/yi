/**
 * The settings row's second button: putting the file this build ships back over the reader's copy.
 *
 * `ensure_defaults_in` writes a kind's defaults file once and never again — that is what makes an edit
 * the reader's — so a *better* file in a later build reaches only a reader who never exported that kind
 * (`docs/roadmap.md` has the measurement: the latex file's font line had to be written over the app's
 * own copy by hand). The answer is a button the reader presses, and it is offered only when there is
 * something to replace: a copy that already *is* the shipped one shows nothing, and a copy that differs
 * — an edit, or an older build's file — shows it behind the app's own question, which says what it
 * replaces.
 *
 * What this probe holds, in the order it happens: nothing to press while the two are the same; the
 * button appears when they are not; *no* (the cautious answer) leaves the file exactly as it was; *yes*
 * writes the shipped bytes and takes the button away. The file is the app's own, so the probe reads it
 * first and puts it back whatever happens (nothing else does that for a kind's settings file) — and it
 * **puts the app's copy into the shipped state before it starts**, through the app's own command for
 * it, because a copy written by an earlier build is a copy that differs: measured the hard way, on a
 * machine whose `export.pdf.yaml` still named the `CJKmainfont` of two builds ago, where this probe
 * read "offered for replacement" as a bug in the app when it was the data folder's state all along.
 *
 * And it holds where the button goes: beside *Reveal in folder* on one line, so the button coming and
 * going leaves the file's own line and everything under it exactly where it was.
 *
 * @covers src-tauri/src/export.rs (KindInfo::config_is_shipped, export_restore_config),
 *   src/ui/export/export_dialog.ts (replaceConfiguration)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    const read = await invoke('plugin:fs|read_text_file', { path });
    return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
  };
  const until = async (ready, tries = 80) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-replace-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/note.md`;
  const note = '# Going out\n\nA note.\n';
  const api = await t.app('/src/api/export.ts');
  // The file the app itself names for this kind, rather than a path written down here.
  const config = (await api.exportKinds()).kinds.find((kind) => kind.kind === 'pdf').config_path;

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const replaceButton = () => card()?.querySelector('[data-export-replace-config]') ?? null;
  const offered = () => {
    const button = replaceButton();
    return button !== null && !button.classList.contains('hidden');
  };
  const promptCard = () => document.querySelector('[data-prompt]');
  const promptOpen = () => {
    const veil = promptCard();
    return veil !== null && !veil.classList.contains('hidden');
  };
  /** Opens a note and waits for it, bounded — see `export-docx.js` for why. */
  const show = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    let opened = false;
    void pending.then(() => {
      opened = true;
    });
    for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
      const prompt = document.querySelector('[data-prompt]');
      if (prompt !== null && !prompt.classList.contains('hidden')) {
        prompt.querySelector('[data-prompt-no]')?.click();
        break;
      }
      await sleep(50);
    }
    await Promise.race([pending, sleep(2000)]);
    await sleep(200);
  };
  const openTheCard = async () => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'pdf' });
    await until(() => open(), 60);
    await sleep(150);
    return card();
  };
  const closeCard = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
  };

  const before = await invoke('get_config');
  const configBefore = await readText(config);
  // The copy the app *ships*, put in place first: the two checks that start from "already the shipped
  // file" are about the button and not about what this machine's data folder happens to hold.
  await invoke('export_restore_config', { kind: 'pdf' });
  const shippedBefore = await readText(config);
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
    await show(notePath, note);

    // The copy is the one this build ships, so there is nothing to put back and nothing to press.
    await openTheCard();
    check(
      'a copy that is already the shipped file is not offered for replacement',
      !offered(),
      { config: card().querySelector('[data-export-config]')?.textContent ?? null, offered: offered() }
    );
    await closeCard();

    // An edit (or an older build's copy) is one of the two things that is offered.
    const edited = `${shippedBefore}\n# a line the probe wrote\n`;
    await files.writeTextAtomically(config, edited);
    await openTheCard();
    check('a copy that differs is', offered(), { offered: offered() });
    {
      const box = (selector) => card().querySelector(selector)?.getBoundingClientRect() ?? null;
      const reveal = box('[data-export-open-config]');
      const replace = box('[data-export-replace-config]');
      check(
        'and it stands beside the reveal button on one line, not under it',
        reveal !== null &&
          replace !== null &&
          Math.abs(reveal.top - replace.top) < 1 &&
          replace.left >= reveal.right,
        {
          reveal: reveal === null ? null : [Math.round(reveal.left), Math.round(reveal.top)],
          replace: replace === null ? null : [Math.round(replace.left), Math.round(replace.top)]
        }
      );
    }

    // *No* — the cautious answer — writes nothing at all.
    replaceButton()?.click();
    await until(() => promptOpen(), 40);
    promptCard()?.querySelector('[data-prompt-no]')?.click();
    await sleep(250);
    check(
      'and the answer that does not leaves the file exactly as it was',
      (await readText(config)) === edited,
      { same: (await readText(config)) === edited }
    );

    // *Yes* writes the shipped file back, and the button goes with the reason for it.
    replaceButton()?.click();
    await until(() => promptOpen(), 40);
    promptCard()?.querySelector('[data-prompt-yes]')?.click();
    await sleep(300);
    check(
      'and agreeing puts the shipped file back, byte for byte',
      (await readText(config)) === shippedBefore && !offered(),
      {
        shipped: (await readText(config)) === shippedBefore,
        stillOffered: offered()
      }
    );
    await closeCard();
  } finally {
    // The settings file is the app's own, and nothing else puts it back: whatever happened above, the
    // copy this run found is the copy the next run meets.
    await files.writeTextAtomically(config, configBefore);
    try {
      await files.deleteEntry(folder);
    } catch {
      // Nothing to tidy.
    }
    await t.restoreWorkspace(before);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
