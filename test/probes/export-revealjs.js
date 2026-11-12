/**
 * Reveal.js exports a local bundle by default, with independent choices for its
 * distribution files and remote pictures.
 *
 * @covers src-tauri/src/export/revealjs.rs,
 *   src-tauri/src/export/run/mod.rs,
 *   src/ui/export/workflow/index.ts,
 *   src/ui/export/dialog/index.ts
 * @needs-http-fixture
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const checks = [];
  const check = (name, pass, actual = null) => checks.push({ name, pass, actual });
  const sleep = t.sleep;

  const readText = async (path) => {
    try {
      const read = await invoke('plugin:fs|read_text_file', { path });
      return new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read));
    } catch {
      return null;
    }
  };
  const exists = async (path) => {
    try {
      return await invoke('plugin:fs|exists', { path });
    } catch {
      return false;
    }
  };
  const until = async (ready, tries = 100) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (await ready()) return true;
      await sleep(75);
    }
    return false;
  };
  const remoteFileName = (url) => {
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(url)) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    const tail =
      url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? 'picture';
    const stem =
      (tail.split('.')[0].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'picture');
    return `${stem}-${hash.toString(16).padStart(16, '0')}`;
  };
  const pictureName = `${remoteFileName(`${window.__probeHttpBase}/image.png`)}.png`;

  const home = await invoke('plugin:path|resolve_directory', { directory: 21 });
  const folderName = `yi-probe-export-revealjs-${Date.now().toString(36)}`;
  const folder = `${home}/${folderName}`;
  const notePath = `${folder}/deck.md`;
  const target = `${folder}/deck`;
  const pagePath = `${target}/deck.html`;
  const imageUrl = `${window.__probeHttpBase}/image.png`;
  const note = [
    '---',
    'title: Reveal.js Probe',
    'subtitle: Local presentations',
    'author: Yi',
    'date: 2026-10-30',
    'theme: black',
    'transition: slide',
    'slide-level: 2',
    '---',
    '',
    '# Section',
    '',
    '## First slide',
    '',
    `A picture ![probe](${imageUrl}), a formula $e^{i\\pi}+1=0$, and a citation [@smith2020].`,
    '',
    '::: {.callout .callout-note}',
    'A slide note.',
    ':::',
    ''
  ].join('\n');

  const card = () => document.querySelector('[data-export-dialog]');
  const open = () => card() !== null && !card().classList.contains('hidden');
  const show = async () => {
    const pending = session.documentSession.openFile({ path: notePath, content: note });
    await sleep(200);
    const prompt = document.querySelector('[data-prompt]');
    if (prompt !== null && !prompt.classList.contains('hidden')) {
      prompt.querySelector('[data-prompt-no]')?.click();
    }
    await Promise.race([pending, sleep(2000)]);
    await sleep(200);
  };
  const runMode = async (remoteJs, remotePictures) => {
    await invoke('plugin:event|emit', { event: 'export', payload: 'revealjs' });
    await until(() => open(), 60);
    const veil = card();
    const jsBox = veil.querySelector('[data-export-revealjs-remote-js]');
    const pictureBox = veil.querySelector('[data-export-revealjs-remote-pictures]');
    jsBox.checked = remoteJs;
    pictureBox.checked = remotePictures;
    const hints = t.hintsNow();
    veil.querySelector('[data-export-run]').click();
    const wrote = await until(
      () => t.newHint(hints, (words) => words.startsWith('Exported to')) !== null
    );
    return {
      wrote,
      page: wrote ? await readText(pagePath) : null,
      messages: [...document.querySelectorAll('[data-message-text]')].map(
        (element) => element.textContent
      )
    };
  };

  const before = await invoke('get_config');
  try {
    await invoke('export_use_revealjs_cdn', {
      base: `${window.__probeHttpBase}/revealjs`
    });
    await invoke('export_restore_config', { kind: 'revealjs' });
    try {
      await files.deleteEntry(folder);
    } catch {
      // A previous cut-off run.
    }
    await files.createEntry(home, folderName, false);
    await files.createEntry(folder, 'deck.md', true);
    await files.writeTextAtomically(notePath, note);
    await t.openWorkspace(folder);
    await show();

    await invoke('plugin:event|emit', { event: 'export', payload: 'revealjs' });
    await until(() => open(), 60);
    const cardAtOpen = card();
    check(
      'Reveal.js opens a folder target with local resources selected',
      cardAtOpen?.dataset.exportKind === 'revealjs' &&
        cardAtOpen.querySelector('[data-export-target]')?.value === target &&
        cardAtOpen.querySelector('[data-export-revealjs-remote-js]')?.checked === false &&
        cardAtOpen.querySelector('[data-export-revealjs-remote-pictures]')?.checked === false &&
        !cardAtOpen
          .querySelector('[data-export-revealjs-remote-js]')
          ?.closest('div.mt-3')
          ?.classList.contains('hidden') &&
        !cardAtOpen
          .querySelector('[data-export-revealjs-remote-pictures]')
          ?.closest('div.mt-3')
          ?.classList.contains('hidden') &&
        [...cardAtOpen.querySelectorAll('div.hidden')].some((row) =>
          row.textContent.includes('Template')
        ) &&
        cardAtOpen.querySelector('[data-export-self-contained]')
          ?.closest('div.mt-3')
          ?.classList.contains('hidden'),
      {
        kind: cardAtOpen?.dataset.exportKind ?? null,
        target: cardAtOpen?.querySelector('[data-export-target]')?.value ?? null
      }
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(100);

    const local = await runMode(false, false);
    check('the local bundle is written', local.wrote && local.page !== null, local);
    const localFiles = {
      revealJs: await exists(`${target}/js/dist/reveal.js`),
      revealCss: await exists(`${target}/js/dist/reveal.css`),
      theme: await exists(`${target}/js/dist/theme/black.css`),
      notes: await exists(`${target}/js/dist/plugin/notes.js`),
      search: await exists(`${target}/js/dist/plugin/search.js`),
      zoom: await exists(`${target}/js/dist/plugin/zoom.js`)
    };
    check(
      'local Reveal.js uses js/dist files instead of the CDN',
      local.page?.includes('js/dist/reveal.js') &&
        !local.page.includes('unpkg.com/reveal.js') &&
        Object.values(localFiles).every(Boolean),
      {
        references: local.page?.match(/(?:src|href)="[^"]*reveal[^"]*"/g),
        files: localFiles
      }
    );
    check(
      'local pictures are copied into images',
      local.page?.includes(`images/${pictureName}`) &&
        !local.page.includes(imageUrl) &&
        (await exists(`${target}/images/${pictureName}`)),
      { expected: `images/${pictureName}` }
    );

    const remoteJs = await runMode(true, false);
    check(
      'remote Reveal.js keeps the CDN while pictures stay local',
      remoteJs.page?.includes('https://unpkg.com/reveal.js@6.0.1') &&
        remoteJs.page.includes(`images/${pictureName}`) &&
        !remoteJs.page.includes(imageUrl),
      remoteJs.page?.match(/https:\/\/unpkg\.com\/[^"']+/g)?.slice(0, 2)
    );

    const remotePictures = await runMode(false, true);
    check(
      'remote pictures keep the URL while Reveal.js stays local',
      remotePictures.page?.includes(imageUrl) &&
        remotePictures.page.includes('js/dist/reveal.js') &&
        !remotePictures.page.includes('unpkg.com/reveal.js'),
      remotePictures.page?.match(/https?:\/\/[^"']*image\.png/g)
    );

    const remoteAll = await runMode(true, true);
    check(
      'both remote choices are independent and may be used together',
      remoteAll.page?.includes('https://unpkg.com/reveal.js@6.0.1') &&
        remoteAll.page.includes(imageUrl),
      remoteAll.page?.match(/https:\/\/unpkg\.com\/[^"']+/g)?.slice(0, 2)
    );

    await invoke('export_use_revealjs_cdn', {
      base: `${window.__probeHttpBase}/missing-revealjs`
    });
    const failureTarget = `${folder}/failed`;
    const messagesBefore = new Set(
      [...document.querySelectorAll('[data-message-text]')].map((element) => element.textContent)
    );
    await invoke('plugin:event|emit', { event: 'export', payload: 'revealjs' });
    await until(() => open(), 60);
    const failureCard = card();
    const failureInput = failureCard.querySelector('[data-export-target]');
    failureInput.value = failureTarget;
    failureInput.dispatchEvent(new Event('input', { bubbles: true }));
    failureCard.querySelector('[data-export-run]').click();
    const failed = await until(
      () =>
        [...document.querySelectorAll('[data-message-text]')].some(
          (element) => !messagesBefore.has(element.textContent)
        ),
      200
    );
    const failedEntries = await files.listFolderFiles(failureTarget).catch(() => []);
    check(
      'a failed Reveal.js export reports the error and removes its new partial bundle',
      failed && failedEntries.length === 0 && !(await exists(failureTarget)),
      {
        failed,
        entries: failedEntries.map((entry) => entry.basename),
        messages: [...document.querySelectorAll('[data-message-text]')].map(
          (element) => element.textContent
        )
      }
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
