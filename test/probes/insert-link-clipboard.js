/**
 * The Link button when the clipboard offers no URL: the link is still written, with an
 * empty destination, and a clipboard the app cannot read at all is not an error.
 *
 * Three ways the read can come back: text that is not a URL, a backend that does not
 * answer (a build or platform without the app's own read, so the webview's API is asked
 * instead), and a webview that refuses too. Its own probe because the cases are three
 * documents deep and a probe gets five seconds; the probes stand in for the backend the
 * way `footnote-preview.js` does, and for the webview's own clipboard API, which wants
 * the user gesture a synthetic click is not.
 *
 * @covers src/ui/markdown/editing/links.ts, src/api/clipboard.ts, src/ui/markdown/syntax/link_edits.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** The webview's own clipboard API as this page has it, for the record. */
  const realClipboard = {
    clipboard: typeof navigator.clipboard,
    readText: typeof navigator.clipboard?.readText
  };
  /** Answers the app's clipboard read with `text` (or fails, when `text` is a thrower). */
  const stubBackend = (text) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      if (!url.includes('read_clipboard_text')) {
        return await real.call(window, input, init);
      }
      if (text === null) {
        // No such command: what a platform without the app's own read answers.
        return new Response('command not found', {
          status: 404,
          headers: { 'content-type': 'text/plain', 'Tauri-Response': 'error' }
        });
      }
      return new Response(JSON.stringify(text), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    };
    return () => {
      window.fetch = real;
    };
  };
  /** Answers the webview's own clipboard API with `text` (or refuses, when null). */
  const stubWebviewClipboard = (text) => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => {
          if (text === null) {
            throw new Error('NotAllowedError');
          }
          return text;
        }
      }
    });
    return () => {
      if (real) {
        Object.defineProperty(Navigator.prototype, 'clipboard', real);
      }
      delete navigator.clipboard;
    };
  };
  const press = async () => {
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Link'
    );
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await t.sleep(300);
  };
  /** Puts the caret after `Body`, the way a click does. */
  const place = async () => {
    const text = t.textNodesIn(t.blocks()[0])[0];
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(150);
    const caret = caretModule.getCaretRange();
    return caret ? caret.startOffset : null;
  };

  // 1. The app's own read answers with text that is not a URL — while the webview's API
  // is standing by with a URL, so a fall-through would show up as a filled destination.
  await t.load('Body text here.\n');
  let restoreBackend = stubBackend('two words, not a url');
  let restoreWebview = stubWebviewClipboard('https://example.com/webview');
  try {
    const placed = await place();
    check('the probe put the caret after `Body`', placed === 4, placed);
    await press();
    check(
      'the app`s own read is the answer: text that is not a URL leaves the destination empty',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
  } finally {
    restoreWebview();
    restoreBackend();
  }

  // 2. The app's read is not there at all: the webview's own API answers instead.
  await t.load('Body text here.\n');
  restoreBackend = stubBackend(null);
  restoreWebview = stubWebviewClipboard('https://example.com/fallback');
  try {
    const placed = await place();
    check('the probe put the caret after `Body` again', placed === 4, placed);
    await press();
    check(
      'a backend without the read falls back to the webview clipboard',
      (await t.raw()) === 'Body[](https://example.com/fallback) text here.\n',
      await t.raw()
    );
  } finally {
    restoreWebview();
    restoreBackend();
  }

  // 3. Neither read works: the link is written without a destination, and no error.
  await t.load('Body text here.\n');
  restoreBackend = stubBackend(null);
  restoreWebview = stubWebviewClipboard(null);
  try {
    await place();
    await press();
    check(
      'a refused clipboard is not an error — the link is written without a URL',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
  } finally {
    restoreWebview();
    restoreBackend();
  }

  return {
    // Not a check: the button works without any of it (that is what the cases above
    // show), so what this page's clipboard API offers is a fact to read, not a verdict.
    clipboardApi: realClipboard,
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
