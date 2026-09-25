/**
 * What each gesture on a link does: ⌘-click (Ctrl-click) opens the URL in the
 * default browser through the app's opener, a plain click opens the link as its own
 * source for editing, and a link with nothing openable — a relative path — keeps the
 * plain click, because opening its source is the only thing left that it can mean.
 *
 * The webview must never navigate to the URL itself: the opened link is checked the
 * way `footnote-preview.js` checks the same thing, by standing in for the backend for
 * that one command (`watchOpener`) and answering it, so a probe never opens a browser.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/syntax/link_edits.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /**
   * Stands in for the backend for the opener, so nothing is opened for real: the app
   * posts every command through the page's `fetch` (the IPC surface itself is defined
   * non-writable), and what it posts is recorded here and answered.
   */
  const watchOpener = () => {
    const calls = [];
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      if (!url.includes('plugin:opener')) {
        return await real.call(window, input, init);
      }
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : String(init?.body) });
      return new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    };
    return {
      calls,
      stop: () => {
        window.fetch = real;
      }
    };
  };
  const link = () => t.prose().querySelector('a.markdown-link[href]');
  const source = () => t.prose().querySelector('.markdown-link-source');
  const click = (element, modifier = {}) => {
    const box = element.getBoundingClientRect();
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ...modifier,
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2)
    });
    element.dispatchEvent(event);
    return event;
  };
  const opened = (recorder) =>
    recorder.calls.some((entry) => entry.url.includes('open_url'));

  // 1. ⌘-click, and Ctrl-click with it: the URL leaves for the system's browser.
  const doc = 'See [title](https://example.com/page) here.\n';
  await t.load(doc);
  let recorder = watchOpener();
  try {
    const hashBefore = location.hash;
    const meta = click(link(), { metaKey: true });
    await t.sleep(250);
    check(
      'a cmd-click asks the app to open the URL',
      recorder.calls.some(
        (entry) => entry.url.includes('open_url') && entry.body.includes('https://example.com/page')
      ),
      recorder.calls
    );
    check(
      'and the webview does not navigate to it',
      meta.defaultPrevented && location.hash === hashBefore,
      { prevented: meta.defaultPrevented, hash: location.hash, before: hashBefore }
    );
    check('and the link is not opened as its own source', source() === null, source()?.textContent ?? null);
    check('and the document is untouched', (await t.raw()) === doc, await t.raw());
    recorder.calls.length = 0;
    click(link(), { ctrlKey: true });
    await t.sleep(250);
    check('a ctrl-click does the same', opened(recorder), recorder.calls);
  } finally {
    recorder.stop();
  }

  // 2. A plain click is still the editor's: the source opens, nothing is opened.
  recorder = watchOpener();
  try {
    await t.load(doc);
    click(link());
    await t.sleep(300);
    check(
      'a plain click still opens the link as its own source',
      source()?.textContent === '[title](https://example.com/page)',
      source()?.textContent ?? null
    );
    check('and asks the app to open nothing', !opened(recorder), recorder.calls);
  } finally {
    recorder.stop();
  }

  // 3. A link the app cannot open: the plain click's behaviour, for the same click.
  await t.load('See [rel](notes/a.md) here.\n');
  recorder = watchOpener();
  try {
    click(link(), { metaKey: true });
    await t.sleep(300);
    check('a relative link is not opened', !opened(recorder), recorder.calls);
    check(
      'and its source opens instead, which is the only thing it can mean',
      source()?.textContent === '[rel](notes/a.md)',
      source()?.textContent ?? null
    );
  } finally {
    recorder.stop();
  }

  // 4. An autolink holds no source to open, and is one the app may open.
  await t.load('See https://example.com/auto here.\n');
  recorder = watchOpener();
  try {
    const autolink = link();
    check(
      'the autolink renders as an anchor with its own URL',
      autolink !== null && autolink.getAttribute('href') === 'https://example.com/auto',
      autolink?.getAttribute('href') ?? null
    );
    if (autolink) {
      click(autolink, { metaKey: true });
      await t.sleep(250);
      check(
        'and a cmd-click on it opens it',
        recorder.calls.some((entry) => entry.body.includes('https://example.com/auto')),
        recorder.calls
      );
    }
  } finally {
    recorder.stop();
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
