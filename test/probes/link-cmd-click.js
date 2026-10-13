/**
 * What each gesture on a link does: ⌘-click (Ctrl-click) opens the URL in the
 * default browser through the app's opener, a plain click opens the link as its own
 * source for editing, and a destination that names no file *and* no URL — a `#fragment`,
 * an empty href — keeps the plain click, because opening its source is the only thing
 * left that it can mean.
 *
 * A *path* is the app's own to open instead (`syntax/link_edits.ts: isFilePath`), which this
 * probe holds from the browser's side: a path is never handed to the opener, and its source does
 * not open on a ⌘-click. What happens instead is `link-opens-a-note.js`'s, in a note whose links
 * really are files.
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

  // 3. Two destinations that name no file *and* no URL.
  //
  // A `#fragment` is a place in this page, so the browser is asked for nothing and the plain
  // click's behaviour stands, because opening the source is the only thing left that it can mean.
  // A *path* is different: it is the app's to open now (`syntax/link_edits.ts: isFilePath`), so a
  // ⌘-click on one is the editor's own and its source does *not* open — `link-opens-a-note.js`
  // holds what happens instead, in a note whose links really are files.
  await t.load('See [frag](#here) here.\n');
  recorder = watchOpener();
  try {
    click(link(), { metaKey: true });
    await t.sleep(300);
    check('a fragment is not opened', !opened(recorder), recorder.calls);
    check(
      'and its source opens instead, which is the only thing it can mean',
      source()?.textContent === '[frag](#here)',
      source()?.textContent ?? null
    );
  } finally {
    recorder.stop();
  }

  await t.load('See [rel](notes/a.md) here.\n');
  recorder = watchOpener();
  try {
    click(link(), { metaKey: true });
    await t.sleep(300);
    check('a path is not handed to the browser', !opened(recorder), recorder.calls);
    check(
      'and its source does not open: the app asked for the file',
      source() === null,
      source()?.textContent ?? null
    );
  } finally {
    recorder.stop();
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
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

  // 5. A link whose *path* has spaces in it, and the same path written the way a browser spells
  //    one: another editor writes both, and both are links here (`syntax/spaced_destinations.ts`).
  //    A destination like this is inert — nothing in the app resolves a path, only a URL — so what
  //    this holds is the reading, and that a plain click is still the editor's.
  const spacedDoc = 'See [note](my note.md) and [other](my%20note.md) here.\n';
  await t.load(spacedDoc);
  await t.sleep(250);
  const written = [...t.prose().querySelectorAll('a.markdown-link')].map((anchor) => ({
    text: anchor.textContent,
    href: anchor.getAttribute('href')
  }));
  check('a link whose path has spaces is a link', written.some((entry) => entry.href === 'my note.md'), written);
  check('and one written with %20 is a link too', written.some((entry) => entry.href === 'my%20note.md'), written);
  click(t.prose().querySelector('a.markdown-link'));
  await t.sleep(300);
  check(
    'and a plain click still opens it as its own source',
    source()?.textContent === '[note](my note.md)',
    source()?.textContent ?? null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
