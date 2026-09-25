/**
 * The Link button when the clipboard offers no URL: the link is still written, with an
 * empty destination, and a clipboard the app may not read at all is not an error.
 *
 * Its own probe because the two answers are the two ways the clipboard can fail — text
 * that is not a URL, and a read that is refused (no permission, no user gesture) — and
 * because a probe gets five seconds. The probe stands in for `navigator.clipboard.readText`
 * the way `insert-link.js` does, and reports whether the platform's own API is there.
 *
 * @covers src/ui/markdown/editing/links.ts, src/ui/markdown/syntax/link_edits.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** The platform's own clipboard API, as this page sees it (for the record). */
  const realClipboard = {
    clipboard: typeof navigator.clipboard,
    readText: typeof navigator.clipboard?.readText
  };
  /**
   * Answers the clipboard with `read`, and hands back the way to put it back. The real
   * `readText` wants the user gesture a synthetic click is not, so a probe cannot call
   * it — this stands in for it.
   */
  const stubClipboard = (read) => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: read } });
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
  const body = () => t.textNodesIn(t.blocks()[0])[0];
  /** Puts the caret after `Body`, the way a click does. */
  const place = async () => {
    const text = body();
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

  // 1. The clipboard holds text that is not a URL.
  await t.load('Body text here.\n');
  let restore = stubClipboard(async () => 'two words, not a url');
  try {
    const placed = await place();
    check('the probe put the caret after `Body`', placed === 4, placed);
    await press();
    check(
      'a clipboard with no URL in it leaves the destination empty',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
  } finally {
    restore();
  }

  // 2. The clipboard refuses to be read at all.
  await t.load('Body text here.\n');
  restore = stubClipboard(async () => {
    throw new Error('NotAllowedError');
  });
  try {
    const placed = await place();
    check('the probe put the caret after `Body` again', placed === 4, placed);
    await press();
    check(
      'a refused clipboard is not an error — the link is written without a URL',
      (await t.raw()) === 'Body[]() text here.\n',
      await t.raw()
    );
  } finally {
    restore();
  }

  return {
    // No check for it: the button works without the API (that is the point of the two
    // cases above), so what this page's clipboard offers is a fact to read, not a verdict.
    clipboardApi: realClipboard,
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
