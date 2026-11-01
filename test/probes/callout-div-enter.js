/**
 * A fenced-Div callout accepts one newline per Enter, including repeated blank
 * lines, and leaves the caret on the newest line.
 *
 * @covers src/ui/markdown/editing/text/index.ts,
 *   src/ui/markdown/syntax/container/quote/
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const clickOffset = async (source, offset) => {
    const text = source === null ? null : t.textNodesIn(source)[0];
    if (!text) {
      return false;
    }
    const at = Math.max(0, Math.min(offset, text.data.length - 1));
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.right - 0.5,
      clientY: box.top + box.height / 2
    };
    source.dispatchEvent(new PointerEvent('pointerdown', event));
    source.dispatchEvent(new PointerEvent('pointerup', event));
    source.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(150);
    return true;
  };
  const openSource = async () => {
    await t.load('::: {.callout .callout-note}\nA\n:::\n');
    await t.click(t.prose().querySelector('.markdown-callout-body p'), 0.5);
    await t.sleep(150);
    return t.prose().querySelector('.markdown-callout-source');
  };

  const one = await openSource();
  check('the fenced-Div body exposes source', one !== null, true);
  await clickOffset(one, 29);
  t.key('Enter');
  await t.sleep(150);
  t.key('Z');
  await t.sleep(200);
  check(
    'Enter adds one line and leaves the caret on it',
    await t.raw(),
    '::: {.callout .callout-note}\nA\nZ\n:::\n'
  );

  const repeated = await openSource();
  check('the repeated-Enter Div exposes source', repeated !== null, true);
  await clickOffset(repeated, 29);
  t.key('Enter');
  await t.sleep(80);
  t.key('Enter');
  await t.sleep(80);
  t.key('Enter');
  await t.sleep(80);
  t.key('Z');
  await t.sleep(200);
  check(
    'repeated Enter appends blank lines and keeps the caret on the newest',
    await t.raw(),
    '::: {.callout .callout-note}\nA\n\n\nZ\n:::\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
