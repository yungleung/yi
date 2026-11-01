/**
 * The card's font hint: a note written in characters the conversion settings name no font for.
 *
 * What happens without one is measured and quiet: the page keeps the words' places and loses the
 * words (XeTeX warns *"Missing character: There is no 한 (U+D55C) in font [lmroman10-regular]"* for
 * each, and the app shows those lines as a message — after the export, in XeTeX's words). The hint is
 * the app saying it *before* the reader exports, in its own words, with the settings file it names
 * already on the card beside it and the button that reveals that file.
 *
 * **This build ships a face per script**, wired into the page by a header of its own
 * (`export-pdf-scripts.js` is the page that proves it), so the hint has gone quiet about every script
 * it ships: a Chinese note, a Korean note and one in Greek all get nothing to fix. What is left for it
 * is what no face covers — Tamil, Ethiopic and the rest, whose line is `mainfont:` — and the characters
 * the TeX suite's own font was measured to miss. Kinds whose output carries the characters as characters
 * (a docx, a page, a book) are never hinted at whatever the note is written in.
 *
 * **And the other thing a settings file can get wrong**: a font name this machine has none of. That is
 * not a lost character, it is a run that never happens — XeTeX stops the whole export with *"The font …
 * cannot be found"* rather than falling back — so the card says it as its own line, while the reader is
 * looking at the file the name is written in. The last pair here writes a name nothing answers to, and
 * then a name something does, into the reader's own copy for the length of the check.
 *
 * The last pair is the rule's other half (`ui/export/workflow/font_hint.ts`): what the default font was
 * measured to *miss* is reported even though it sits inside a block a range table would call covered
 * (`≤`, where `√ ∞ ± × ÷` beside it draw), and the same character inside `$…$` is not reported at all,
 * because pandoc sets a formula with the maths font.
 *
 * @covers src-tauri/src/export.rs (export_named_fonts, needs_a_font, export_font_for),
 *   src-tauri/src/system_fonts.rs (the names this machine has, and what it draws),
 *   src/ui/export/workflow/font_hint.ts (the characters, over the parse),
 *   src/ui/export/workflow/index.ts (the characters the card is asked with),
 *   src/ui/export/dialog/index.ts (the hint)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const api = await t.app('/src/api/export.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-font-hint-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => {
    const veil = card();
    return veil !== null && !veil.classList.contains('hidden');
  };
  const hint = () => {
    const line = card()?.querySelector('[data-export-font-hint]');
    return line === null || line === undefined || line.classList.contains('hidden')
      ? null
      : line.textContent;
  };
  /** The line for a font name this machine has none of, or null while it is hidden. */
  const unknown = () => {
    const line = card()?.querySelector('[data-export-unknown-fonts]');
    return line === null || line === undefined || line.classList.contains('hidden')
      ? null
      : line.textContent;
  };
  const readText = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_text_file', { path });
      return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
    } catch {
      return null;
    }
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
  /** Asks for a kind the way its menu item does and answers with the card, once it is up. */
  const askFor = async (kind) => {
    await invoke('plugin:event|emit', { event: 'export', payload: kind });
    for (let attempt = 0; attempt < 60 && !open(); attempt += 1) {
      await sleep(50);
    }
    await sleep(150);
    return card();
  };

  const before = await invoke('get_config');
  try {
    try {
      await files.deleteEntry(folder);
    } catch {
      // A folder a run the bridge cut off left behind.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'note.md', true);
    await t.openWorkspace(folder);

    // Korean, and Chinese, and Greek: faces are shipped for all three, so a note in any of them has
    // nothing to fix and the card says nothing.
    const koreanPath = `${folder}/korean.md`;
    await files.writeTextAtomically(koreanPath, '# Going out\n\n한국어 and latin after it.\n');
    await show(koreanPath, '# Going out\n\n한국어 and latin after it.\n');
    await askFor('pdf');
    check(
      'a note in a script this build ships a face for gets no hint at all, Hangul included',
      hint() === null,
      { hint: hint() }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // The same Korean note as a kind whose output carries the characters as characters: whatever
    // opens the file picks a font of its own, so there is nothing for the reader to fix.
    await askFor('docx');
    check(
      'and a kind that carries the characters as characters never asks for a font',
      hint() === null && card().dataset.exportKind === 'docx',
      { hint: hint(), kind: card().dataset.exportKind ?? null }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // Chinese, which that same line *is* for: nothing to say.
    const chinesePath = `${folder}/chinese.md`;
    await files.writeTextAtomically(chinesePath, '# Going out\n\n简体中文 and latin after it.\n');
    await show(chinesePath, '# Going out\n\n简体中文 and latin after it.\n');
    await askFor('pdf');
    check(
      'a note in the script the settings do name a font for gets no hint at all',
      hint() === null,
      { hint: hint() }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // Tamil: no face is shipped for it, so the card says which characters need one and names the widest
    // font this machine is known to have, in the line that answers for it.
    const tamilPath = `${folder}/tamil.md`;
    await files.writeTextAtomically(tamilPath, '# Going out\n\nதமிழ் and latin after it.\n');
    await show(tamilPath, '# Going out\n\nதமிழ் and latin after it.\n');
    await askFor('pdf');
    const tamilHint = hint();
    check(
      'a note in a script with no face of its own is said so, with the characters it is written in',
      (tamilHint ?? '').includes('த') && (tamilHint ?? '').includes('ழ'),
      { hint: tamilHint }
    );
    // And the name it gives is one **this machine really has**, checked by the app itself: read out of
    // the hint and written into the settings file, where the card's own unknown-font line is what says
    // whether the machine answers to it — a suggestion the machine does not have is the very failure
    // that line exists for, so the two hold each other.
    const suggested = /`mainfont: "([^"]+)"`/.exec(tamilHint ?? '')?.[1] ?? null;
    check(
      'and it names a font for the reader to type, out of this machine’s own',
      suggested !== null,
      { suggested, hint: tamilHint }
    );
    if (suggested !== null) {
      const config = (await invoke('export_config_path', { kind: 'pdf' })) ?? '';
      const settings = await readText(config);
      try {
        await files.writeTextAtomically(
          config,
          (settings ?? '').replace('\nvariables:\n', `\nvariables:\n  mainfont: "${suggested}"\n`)
        );
        await askFor('pdf');
        check(
          'and this machine answers to that name, so an export will not stop on it',
          unknown() === null && hint() === null,
          { suggested, unknown: unknown(), hint: hint() }
        );
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      } finally {
        if (settings !== null) {
          await files.writeTextAtomically(config, settings);
        }
      }
    }
    check(
      'and the card still names the settings file that answers for it, with the button that reveals it',
      (card().querySelector('[data-export-config]')?.textContent ?? '').endsWith(
        '/export/export.pdf.yaml'
      ) && card().querySelector('[data-export-open-config]') !== null,
      {
        config: card().querySelector('[data-export-config]')?.textContent ?? null,
        button: card().querySelector('[data-export-open-config]') !== null
      }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // A character the default font was measured to miss — `≤`, where `√ ∞ ± × ÷` beside it draw — is
    // reported when it is written as text...
    const operatorPath = `${folder}/operator.md`;
    await files.writeTextAtomically(operatorPath, '# Going out\n\nLet x ≤ y hold.\n');
    await show(operatorPath, '# Going out\n\nLet x ≤ y hold.\n');
    await askFor('pdf');
    check(
      'a character the default font misses is said so even inside a block that mostly draws',
      (hint() ?? '').includes('≤'),
      { hint: hint() }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // ...and not when the same one is a formula, which the maths font draws.
    const mathsPath = `${folder}/maths.md`;
    await files.writeTextAtomically(mathsPath, '# Going out\n\nLet $x \\le y$ hold.\n');
    await show(mathsPath, '# Going out\n\nLet $x \\le y$ hold.\n');
    await askFor('pdf');
    check(
      'and the same character inside a formula is not, because the maths font has it',
      hint() === null,
      { hint: hint() }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);

    // A name this machine has no font for. Written into the reader's own copy for the length of these two
    // checks, and put back afterwards — nothing else puts that file back.
    const config = (await invoke('export_config_path', { kind: 'pdf' })) ?? '';
    const settings = await readText(config);
    try {
      const bogus = 'Yi No Such Font 12345';
      await files.writeTextAtomically(
        config,
        (settings ?? '').replace('\nvariables:\n', `\nvariables:\n  yi-thai-font: "${bogus}"\n`)
      );
      await askFor('pdf');
      check(
        'a font name this machine has none of is said on the card, by the name the reader wrote',
        (unknown() ?? '').includes(bogus),
        { unknown: unknown() }
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(200);

      // And a name it *does* have is not: the same line, with a font the app itself names for this
      // machine. A machine the app knows no font for skips this half rather than passing quietly.
      // A name this machine has, asked for directly: Greek, which every machine has a face for.
      const real = await api.exportFontFor([0x03a9]);
      if (real === null) {
        check('and a name the machine does have is not said (skipped: no known font here)', true, {
          real
        });
      } else {
        await files.writeTextAtomically(
          config,
          (settings ?? '').replace('\nvariables:\n', `\nvariables:\n  yi-thai-font: "${real}"\n`)
        );
        await askFor('pdf');
        check(
          'and a name the machine does have is not',
          unknown() === null,
          { real, unknown: unknown() }
        );
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(200);
      }
    } finally {
      if (settings !== null) {
        await files.writeTextAtomically(config, settings);
      }
    }
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
