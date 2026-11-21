/**
 * A release with long notes uses the native prompt with five note lines and a release-page button.
 *
 * The native alert cannot scroll, so sending it the complete GitHub body hides the decision
 * buttons. This probe temporarily removes the harness marker, exercising the reader's path, and
 * intercepts the native dialog arguments.
 *
 * @covers src/services/updates/rules.ts, src/services/updates/backend.ts, src/ui/help/updates.ts
 */
(async () => {
  const t = window.__t;
  const { createUpdates } = await t.app('/src/ui/help/updates.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const notes = Array.from(
    { length: 700 },
    (_, index) =>
      `Release note ${index}: this update includes another detailed paragraph of changes and fixes.`
  ).join('\n');
  const update = {
    rid: 1,
    currentVersion: '0.1.3',
    version: '9.9.9',
    date: '2026-11-22T00:00:00Z',
    body: notes,
    releaseUrl: 'https://github.com/yungleung/yi/releases/tag/v9.9.9',
    rawJson: '{"version":"9.9.9"}'
  };
  const nativeDialogs = [];
  const openedUrls = [];
  const realFetch = window.fetch;
  const tools = window.__t;
  window.fetch = async (input, init) => {
    const url = decodeURIComponent(
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    );
    const body = typeof init?.body === 'string' ? init.body : String(init?.body);
    if (url.includes('plugin:app|bundle_type')) {
      return new Response('"appimage"', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    if (url.includes('plugin:updater|check')) {
      return new Response(JSON.stringify(update), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    if (url.includes('plugin:dialog|message')) {
      nativeDialogs.push({ url, body: JSON.parse(body) });
      return new Response(JSON.stringify('View Release Notes'), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    if (url.includes('plugin:opener|open_url')) {
      openedUrls.push(JSON.parse(body).url);
      return new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    }
    return await realFetch.call(window, input, init);
  };
  window.__t = undefined;
  let result = null;
  try {
    result = await createUpdates().controller.check('manual');
  } finally {
    window.__t = tools;
    window.fetch = realFetch;
  }

  const message = nativeDialogs[0]?.body?.message ?? '';
  check('the updater uses the native prompt', nativeDialogs.length, 1);
  check(
    'the in-page prompt stays closed',
    document.querySelector('[data-prompt]:not(.hidden)'),
    null
  );
  check('the first five notes are shown', message.includes('Release note 4:'), true);
  check('the sixth note is omitted', message.includes('Release note 5:'), false);
  check(
    'the native prompt has install, release notes, and cancel buttons',
    nativeDialogs[0]?.body?.buttons?.YesNoCancelCustom,
    ['Install and Restart', 'View Release Notes', 'Not Now']
  );
  check('the release notes button opens the full release page', openedUrls, [update.releaseUrl]);
  check('viewing the notes declines installation', result, 'declined');
  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    result,
    nativeDialogs
  };
})()
