/**
 * The native Report Issue event reaches one command, and that command asks the
 * opener to open Yi's issue chooser without navigating the webview.
 *
 * @covers src/commands/triggers/native_menu.ts, src/ui/help/report_issue.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const calls = [];
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = decodeURIComponent(
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    );
    if (!url.includes('plugin:opener')) {
      return await realFetch.call(window, input, init);
    }
    calls.push({
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
    check(
      'the native Report Issue event maps to its command',
      menu.commandForMenuEvent('report_issue') === 'help:reportIssue',
      menu.commandForMenuEvent('report_issue')
    );
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'report_issue' });
    await t.sleep(300);
    check(
      'the command opens the guided issue chooser',
      calls.some(
        (entry) =>
          entry.url.includes('open_url') &&
          entry.body.includes('https://github.com/yungleung/yi/issues/new/choose')
      ),
      calls
    );
  } finally {
    window.fetch = realFetch;
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
