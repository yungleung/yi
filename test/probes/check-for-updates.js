/**
 * The native Help item reaches the update command, and a manual check with no
 * newer release reports that quietly without opening a modal.
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

  window.fetch = async (input, init) => {
    const url = decodeURIComponent(
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    );
    if (!url.includes('plugin:updater|check')) {
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

    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'check_for_updates' });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (updaterCalls.length > 0 && t.newHint(before, () => true)) {
        break;
      }
      await t.sleep(100);
    }
    const hint = t.newHint(before, (text) => text.includes('latest version of Yi'));
    check('the menu asks the updater for a release', updaterCalls.length === 1, updaterCalls);
    check(
      'a current manual check says the app is current',
      hint?.textContent === 'You are using the latest version of Yi.',
      hint?.textContent ?? null
    );
    check(
      'a current manual check opens no modal',
      document.querySelector('[data-prompt]')?.classList.contains('hidden') !== false,
      document.querySelector('[data-prompt]')?.className ?? null
    );
  } finally {
    window.fetch = realFetch;
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
