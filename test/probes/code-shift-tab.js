/** Shift+Tab inside a fenced code block takes the indentation back. */
(async () => {
  const t = window.__t;
  const codeText = () => t.prose().querySelector('pre code')?.textContent ?? null;
  await t.load('intro\n\n```ts\n    let a = 1;\n```\n\noutro\n');
  await t.click(t.prose().querySelector('pre'), 0.4);
  const before = { text: codeText(), caret: t.caretRect() };
  t.report({ stage: 'clicked', before });
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  const after = { text: codeText(), caret: t.caretRect(), stillCode: t.prose().querySelector('pre') !== null };
  t.report({ before, after });
  return { before, after };
})()
