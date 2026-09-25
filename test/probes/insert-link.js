/**
 * The Link button: a link at the caret, its destination from the clipboard, and the
 * caret left in the title part to be typed into.
 *
 * The one seam a probe cannot reach is the system clipboard: `navigator.clipboard.readText`
 * needs the user gesture a synthetic click is not. So the probe *stands in* for the
 * clipboard the way `footnote-preview.js` stands in for the app's opener — it answers
 * `readText` itself — and it reports whether the real API is there at all, which is the
 * part a person sees when they press the button for real.
 *
 * @covers src/ui/toolbar/link_toolbar.ts, src/ui/markdown/editing/links.ts,
 *   src/ui/markdown/syntax/link_edits.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const linkButton = () =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Link'
    );
  /** Answers the clipboard with `text`, and hands back the way to put it back. */
  const stubClipboard = (text) => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => text }
    });
    return () => {
      if (real) {
        Object.defineProperty(Navigator.prototype, 'clipboard', real);
      }
      delete navigator.clipboard;
    };
  };
  const press = async () => {
    const button = linkButton();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    await t.sleep(300);
  };
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? {
          text: range.startContainer.textContent,
          offset: range.startOffset,
          source: range.startContainer.parentElement?.className ?? null
        }
      : null;
  };
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
  /** Selects `length` characters of a text node from `start`, as a drag does. */
  const select = async (text, start, end) => {
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(120);
  };
  const body = () => t.textNodesIn(t.blocks()[0])[0];

  check(
    'the button is in the title bar',
    linkButton() !== null && linkButton().getAttribute('title') === 'Link',
    linkButton()?.outerHTML?.slice(0, 80) ?? null
  );
  check(
    'and it draws the link icon the user gave',
    (() => {
      const svg = linkButton()?.querySelector('svg');
      const paths = [...(svg?.querySelectorAll('path') ?? [])];
      return (
        svg?.getAttribute('viewBox') === '0 0 640 512' &&
        paths.length === 2 &&
        paths[0].getAttribute('fill') === 'none' &&
        paths[1].getAttribute('fill') === 'currentColor' &&
        (paths[1].getAttribute('d') ?? '').startsWith('M579.8 267.7')
      );
    })(),
    linkButton()?.querySelector('svg')?.outerHTML?.slice(0, 120) ?? null
  );

  // 1. At the caret, with a URL on the clipboard.
  await t.load('Body text here.\n');
  let restore = stubClipboard('  https://example.com/a\n');
  try {
    await place(body(), 4);
    const placed = caret();
    check('the probe put the caret after `Body`', placed?.offset === 4, placed);
    await press();
    const written = await t.raw();
    check(
      'a press writes an empty-titled link at the caret, with the clipboard URL',
      written === 'Body[](https://example.com/a) text here.\n',
      written
    );
    const landed = caret();
    check(
      'and the caret lands between the brackets',
      landed !== null && landed.offset === 1 && landed.text === '[](https://example.com/a)',
      landed
    );
    t.key('T');
    await t.sleep(250);
    check(
      'so the next keystroke writes the title',
      (await t.raw()) === 'Body[T](https://example.com/a) text here.\n',
      await t.raw()
    );
    check(
      'and the link is shown as its own source, where the caret is',
      t.prose().querySelector('.markdown-link-source') !== null,
      t.prose().querySelector('.markdown-link-source')?.textContent ?? null
    );
    await t.click(t.blocks()[0], 0.02);
    check(
      'and a caret that leaves it renders the link',
      t.prose().querySelector('a[href="https://example.com/a"]')?.textContent === 'T',
      t.prose().querySelector('a')?.outerHTML?.slice(0, 90) ?? null
    );
  } finally {
    restore();
  }

  // 2. A selection: it becomes the title, and the caret sits at its end.
  await t.load('Body text here.\n');
  restore = stubClipboard('https://example.com/b');
  try {
    await select(body(), 5, 9);
    await press();
    check(
      'a press over a selection makes it the title',
      (await t.raw()) === 'Body [text](https://example.com/b) here.\n',
      await t.raw()
    );
    const landed = caret();
    check(
      'and the caret lands at the end of that title',
      landed !== null && landed.offset === 5 && landed.text === '[text](https://example.com/b)',
      landed
    );
    t.key('X');
    await t.sleep(300);
    check(
      'so typing appends to the title',
      (await t.raw()) === 'Body [textX](https://example.com/b) here.\n',
      await t.raw()
    );
  } finally {
    restore();
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
