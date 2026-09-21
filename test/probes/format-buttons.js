/**
 * The formatting buttons: each one wraps the selection in the markers of the
 * style it names, and the rendered block shows that style.
 *
 * The buttons are the only trigger for inline formatting — there is no chord
 * for bold — so this is what proves `format:<style>` is a command the editor
 * answers to.
 *
 * @covers src/ui/toolbar/formatting_toolbar.ts, src/ui/markdown/editing/formatting.ts
 */
(async () => {
  const t = window.__t;
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const styles = [
    { label: 'Bold', raw: '**Alpha** beta.\n', tag: 'STRONG' },
    { label: 'Italic', raw: '*Alpha* beta.\n', tag: 'EM' },
    { label: 'Strikethrough', raw: '~~Alpha~~ beta.\n', tag: 'DEL' },
    { label: 'Inline code', raw: '`Alpha` beta.\n', tag: 'CODE' }
  ];
  const checks = {};
  const failed = [];
  for (const style of styles) {
    await t.load('Alpha beta.\n');
    // A drag over the first word, as a reader selects it.
    const node = t.textNodesIn(t.blocks()[0])[0];
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 'Alpha'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await t.sleep(120);
    const target = button(style.label);
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.click();
    await t.sleep(250);
    const element = t.prose().querySelector(style.tag.toLowerCase());
    checks[style.label] = {
      raw: await t.raw(),
      tag: element ? element.tagName : null,
      text: element ? element.textContent : null
    };
    t.report({ checks });
    if (
      checks[style.label].raw !== style.raw ||
      checks[style.label].tag !== style.tag ||
      checks[style.label].text !== 'Alpha'
    ) {
      failed.push(style.label);
    }
  }
  return { checks, failed };
})()
