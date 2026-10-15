/**
 * The card's font hint: a note written in characters the conversion settings name no font for.
 *
 * What happens without one is measured and quiet: the page keeps the words' places and loses the
 * words (XeTeX warns *"Missing character: There is no 한 (U+D55C) in font [lmroman10-regular]"* for
 * each, and the app shows those lines as a message — after the export, in XeTeX's words). The hint is
 * the app saying it *before* the reader exports, in its own words, with the settings file it names
 * already on the card beside it and the button that reveals that file.
 *
 * The first pair is the rule's file half (`export.rs: export_named_fonts`): the shipped file names
 * `CJKmainfont: "Songti SC"`, which is measured to set Han and kana — so a note in Chinese gets no
 * hint at all — and to leave Hangul to `mainfont`, so a Korean note does. Kinds whose output carries
 * the characters as characters (a docx, a page, a book) are never hinted at whatever the note is
 * written in, which is the third check.
 *
 * The last pair is the rule's other half (`ui/export/font_hint.ts`): what the default font was
 * measured to *miss* is reported even though it sits inside a block a range table would call covered
 * (`≤`, where `√ ∞ ± × ÷` beside it draw), and the same character inside `$…$` is not reported at all,
 * because pandoc sets a formula with the maths font.
 *
 * @covers src-tauri/src/export.rs (export_named_fonts, needs_a_font, suggested_font),
 *   src/ui/export/font_hint.ts (the characters, over the parse),
 *   src/ui/export/export_flow.ts (the characters the card is asked with),
 *   src/ui/export/export_dialog.ts (the hint)
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session.ts');
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

    // Korean. The shipped file names `CJKmainfont`, which does not reach Hangul (measured), so the
    // card says the characters need a font and names them.
    const koreanPath = `${folder}/korean.md`;
    await files.writeTextAtomically(koreanPath, '# Going out\n\n한국어 and latin after it.\n');
    await show(koreanPath, '# Going out\n\n한국어 and latin after it.\n');
    await askFor('pdf');
    const koreanHint = hint();
    check(
      'a note in a script the settings name no font for is said so, with the characters it is written in',
      (koreanHint ?? '').includes('한') && (koreanHint ?? '').includes('국'),
      { hint: koreanHint }
    );
    const suggested = (await api.namedFonts('pdf')).suggested_font;
    check(
      'and it names the widest font this machine is known to have, for the reader to type — in both lines',
      suggested === null ||
        ((koreanHint ?? '').includes(`mainfont: "${suggested}"`) &&
          (koreanHint ?? '').includes(`CJKmainfont: "${suggested}"`)),
      { suggested, hint: koreanHint }
    );
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
