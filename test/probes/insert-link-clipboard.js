/**
 * The Link button when the clipboard offers no URL: the link is still written, with an
 * empty destination, and a clipboard the app cannot read at all is not an error.
 *
 * Two ways the read comes back empty — text that is not a URL, and a read that refuses
 * (a clipboard holding no text, or a permission the app was not granted) — and in both
 * the app asks the *plugin* and nothing else. That there is no webview fallback any more
 * is what the standing-by `navigator.clipboard.readText` proves: it holds a URL of its
 * own, and both cases check it was never asked. Its own probe because the cases are two
 * documents deep and a probe gets five seconds; it stands in for the plugin the way
 * `footnote-preview.js` stands in for the app's opener.
 *
 * @covers src/ui/markdown/editing/links.ts, src/api/clipboard.ts, src/ui/markdown/syntax/link_edits.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  /**
   * Answers the plugin's clipboard read with `text`, or fails it when `text` is null —
   * the shape the plugin answers a clipboard that holds no text with, which is also the
   * shape of "this app may not read the clipboard". Hands back the way to put the page's
   * `fetch` back.
   */
  const stubPlugin = (text) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      if (!url.includes('plugin:clipboard-manager|read_text')) {
        return await real.call(window, input, init);
      }
      if (text === null) {
        return new Response(JSON.stringify('the clipboard holds no text'), {
          status: 200,
          headers: { 'content-type': 'application/json', 'Tauri-Response': 'error' }
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

  /**
   * A webview clipboard API standing by with a URL of its own, counting the times it is
   * asked. With the app's read a plugin, nothing should ever ask it.
   */
  const standByWebviewClipboard = (text) => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    let asked = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => {
          asked += 1;
          return text;
        }
      }
    });
    return {
      restore: () => {
        if (real) {
          Object.defineProperty(Navigator.prototype, 'clipboard', real);
        }
        delete navigator.clipboard;
      },
      asked: () => asked
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

  // 1. The plugin's read answers with text that is not a URL — while the webview's API
  // holds a URL of its own, so a fall-through would show up as a filled destination.
  await t.load('Body text here.\n');
  let restorePlugin = stubPlugin('two words, not a url');
  let webview = standByWebviewClipboard('https://example.com/webview');
  try {
    const placed = await place();
    check('the probe put the caret after `Body`', placed === 4, placed);
    await press();
    check(
      'the plugin`s read is the answer: text that is not a URL leaves the destination empty',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
    check('and the webview clipboard was never asked', webview.asked() === 0, webview.asked());
  } finally {
    webview.restore();
    restorePlugin();
  }

  // 2. The read refuses — a clipboard with no text, or a permission the app did not get:
  // the link is still written, and no error reaches the author.
  await t.load('Body text here.\n');
  restorePlugin = stubPlugin(null);
  webview = standByWebviewClipboard('https://example.com/webview');
  try {
    const placed = await place();
    check('the probe put the caret after `Body` again', placed === 4, placed);
    await press();
    check(
      'a refused clipboard is not an error — the link is written without a URL',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
    check(
      'and the webview clipboard was not asked to take over',
      webview.asked() === 0,
      webview.asked()
    );
  } finally {
    webview.restore();
    restorePlugin();
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
