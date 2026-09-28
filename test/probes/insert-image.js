/**
 * The image button when the clipboard is offering a *destination*: a web URL, a `file://` URL, a
 * path to an image on disk, and a clipboard with nothing usable in it.
 *
 * What the button does with an *image* is `insert-image-blob.js`; this is the half that is the
 * link button's twin — one `applyEdit`, the caret between the brackets — plus the rule an image
 * adds: a path the clipboard names is written the way a note reads it, relative to the folder it
 * is found in, because a note that says `/Users/…/pics/a.png` is a note about one machine.
 *
 * The clipboard is stubbed where the app reads it — the plugin's `read_text`, over the webview's
 * `fetch` — the way `insert-link-clipboard.js` does, so the probe needs no real clipboard and the
 * app's own read is the only thing being answered.
 *
 * @covers src/ui/image/image_flow.ts, src/ui/markdown/syntax/image_edits.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** One check for "this is what it should be", with what it was as the evidence either way. */
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const imageButton = () =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Image'
    );
  /**
   * Answers the app's own clipboard reads: the text it is offering (or a read that refuses, for
   * null), and — since an image is the *other* thing the button looks for — either no image at all
   * or one, as the pixels a real clipboard would hand over.
   */
  const stubClipboard = ({ text = null, image = null } = {}) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      if (url.includes('plugin:clipboard-manager|read_text') || url.includes('plugin:clipboard-manager|read_image')) {
        if (text !== null && url.includes('read_text')) {
          return json(text);
        }
        if (image !== null && url.includes('read_image')) {
          return json(1);
        }
        return new Response(JSON.stringify('there is none'), {
          status: 200,
          headers: { 'content-type': 'application/json', 'Tauri-Response': 'error' }
        });
      }
      if (url.includes('plugin:image|size') && image !== null) {
        return json({ width: image.width, height: image.height });
      }
      if (url.includes('plugin:image|rgba') && image !== null) {
        return new Response(image.rgba, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'Tauri-Response': 'ok' }
        });
      }
      return await real.call(window, input, init);
    };
    return () => {
      window.fetch = real;
    };
  };
  const json = (value) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
    });
  const press = async () => {
    const button = imageButton();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await t.sleep(300);
  };
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? { text: range.startContainer.textContent, offset: range.startOffset }
      : null;
  };
  const body = () => t.textNodesIn(t.blocks()[0])[0];
  /** Puts the caret at an offset in a text node, the way a click does. */
  const place = async (text, offset) => {
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(150);
  };

  check(
    'the image button is in the title bar, beside the link button',
    imageButton() !== null && imageButton().getAttribute('title') === 'Image',
    imageButton()?.outerHTML?.slice(0, 80) ?? null
  );
  check(
    'and it draws the image icon the user gave',
    (() => {
      const svg = imageButton()?.querySelector('svg');
      const box = svg?.querySelector('path[fill="none"]');
      const glyphs = [...(svg?.querySelectorAll('g[fill="currentColor"] path') ?? [])];
      return (
        svg?.getAttribute('viewBox') === '0 0 16 16' &&
        box?.getAttribute('d') === 'M0 0h16v16H0z' &&
        glyphs.length === 2 &&
        (glyphs[0].getAttribute('d') ?? '').startsWith('M6.002 5.5') &&
        (glyphs[1].getAttribute('d') ?? '').startsWith('M2.002 1')
      );
    })(),
    imageButton()?.querySelector('svg')?.outerHTML?.slice(0, 120) ?? null
  );

  // 1. A web URL: the destination is written, and the caret waits between the brackets.
  await t.load('Body text here.\n');
  let restore = stubClipboard({ text: '  https://example.com/a.png\n' });
  try {
    await place(body(), 4);
    await press();
    same(
      'a URL on the clipboard is written at the caret, with the brackets left for its alt text',
      await t.raw(),
      'Body![](https://example.com/a.png) text here.\n'
    );
    same(
      'and the caret lands between them',
      caret(),
      { text: '![](https://example.com/a.png)', offset: 2 }
    );
  } finally {
    restore();
  }

  // 2. A path: a file URL becomes the path it wraps, and a path with a space in it is refused —
  // it cannot be told from a sentence, so the image is written empty for the author to fill in.
  await t.load('Body text here.\n');
  restore = stubClipboard({ text: '/Volumes/photos/2026/a picture.png' });
  try {
    await place(body(), 4);
    await press();
    same(
      'a path with a space in it is not a destination the rule can trust',
      await t.raw(),
      'Body![]() text here.\n'
    );
  } finally {
    restore();
  }

  await t.load('Body text here.\n');
  restore = stubClipboard({ text: 'file:///Volumes/photos/a.png' });
  try {
    await place(body(), 4);
    await press();
    same(
      'and a file URL is handed to the text as the path it wraps',
      await t.raw(),
      'Body![](/Volumes/photos/a.png) text here.\n'
    );
  } finally {
    restore();
  }

  // 3. Nothing usable: the image is still written, with an empty destination to fill in.
  await t.load('Body text here.\n');
  restore = stubClipboard();
  try {
    await place(body(), 4);
    await press();
    same(
      'a clipboard the app cannot read leaves an image to fill in, as the link button does',
      await t.raw(),
      'Body![]() text here.\n'
    );
    same('with the caret inside it, ready for words', caret(), { text: '![]()', offset: 2 });
  } finally {
    restore();
  }

  // 4. A selection becomes the alt text, the same courtesy the link button pays one.
  await t.load('Body text here.\n');
  restore = stubClipboard({ text: 'https://example.com/a.png' });
  try {
    const node = t.textNodesIn(t.blocks()[0])[0];
    const range = document.createRange();
    range.setStart(node, 5);
    range.setEnd(node, 9);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(120);
    await press();
    same(
      'a selection is written as the alt text, and the caret sits at its end',
      [await t.raw(), caret()],
      [
        'Body ![text](https://example.com/a.png) here.\n',
        { text: '![text](https://example.com/a.png)', offset: 6 }
      ]
    );
  } finally {
    restore();
  }

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
