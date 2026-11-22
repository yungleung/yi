/**
 * The native Help item reaches the update command, and a manual check with no
 * newer release opens the native informational dialog.
 *
 * @covers src/commands/triggers/native_menu.ts, src/ui/help/updates.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const before = t.hintsNow();
  const realFetch = window.fetch;
  const updaterCalls = [];
  const nativeDialogs = [];
  let bundleType = 'appimage';

  window.fetch = async (input, init) => {
    const url = decodeURIComponent(
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    );
    if (url.includes('plugin:app|bundle_type')) {
      return new Response(JSON.stringify(bundleType), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    if (!url.includes('plugin:updater|check')) {
      if (url.includes('plugin:dialog|message')) {
        nativeDialogs.push(
          typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body ?? null
        );
        return new Response(JSON.stringify('Ok'), {
          status: 200,
          headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
        });
      }
      return await realFetch.call(window, input, init);
    }
    updaterCalls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : String(init?.body)
    });
    return new Response('null', {
      status: 200,
      headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
    });
  };

  try {
    const menu = await t.app('/src/commands/triggers/native_menu.ts');
    const runtime = await t.app('/src/commands/runtime.ts');
    check(
      'the native update event maps to its command',
      menu.commandForMenuEvent('check_for_updates') === 'help:checkForUpdates',
      menu.commandForMenuEvent('check_for_updates')
    );
    check(
      'the update command is registered',
      runtime.registeredCommands().some((command) => command.id === 'help:checkForUpdates'),
      runtime.registeredCommands().map((command) => command.id)
    );

    const { TauriUpdateBackend } = await t.app('/src/services/updates/backend.ts');
    const backend = new TauriUpdateBackend();
    bundleType = null;
    check(
      'a development build on Linux or Windows does not ask for an update',
      (await backend.check()) === null && updaterCalls.length === 0,
      [...updaterCalls]
    );
    bundleType = 'appimage';
    check(
      'an installed bundle asks for an update once',
      (await backend.check()) === null && updaterCalls.length === 1,
      [...updaterCalls]
    );
    updaterCalls.length = 0;

    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'check_for_updates' });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (updaterCalls.length > 0 && nativeDialogs.length > 0) {
        break;
      }
      await t.sleep(100);
    }
    check('the menu asks the updater for a release', updaterCalls.length === 1, updaterCalls);
    check(
      'a current manual check opens one native dialog',
      nativeDialogs.length === 1,
      nativeDialogs.length
    );
    const currentDialog = nativeDialogs[0] ?? null;
    check(
      'the native dialog says the app is current',
      currentDialog?.title === 'No Updates Available' &&
        currentDialog?.message === 'You are using the latest version of Yi.',
      currentDialog
    );
    const unusedSurfaces = {
      hint: t.newHint(before, () => true)?.textContent ?? null,
      prompt: document.querySelector('[data-prompt]:not(.hidden)')
    };
    check(
      'a current manual check leaves the in-page hint and prompt unused',
      unusedSurfaces.hint === null && unusedSurfaces.prompt === null,
      unusedSurfaces
    );
  } finally {
    window.fetch = realFetch;
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
