/** Tab inside a fenced code block types two spaces. */
(async () => {
  const t = window.__t;
  const codeText = () => t.prose().querySelector('pre code')?.textContent ?? null;
  await t.load('intro\n\n```ts\nlet a = 1;\n```\n\noutro\n');
  const before = { text: codeText(), caret: null };
  await t.click(t.prose().querySelector('pre'), 0.35);
  before.caret = t.caretRect();
  t.report({ stage: 'clicked', before });
  t.scroller().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  );
  await t.sleep(300);
  const after = {
    text: codeText(),
    caret: t.caretRect(),
    stillCode: t.prose().querySelector('pre') !== null,
    highlighted: t.prose().querySelectorAll('pre code span').length
  };
  t.report({ before, after });
  return { before, after };
})()
