/**
 * The formatting buttons: each one wraps the selection in the markers of the
 * style it names. The caret is left inside the run the button just wrote, so
 * the block shows the run's own markdown until the caret leaves it (see
 * `source_mode/`) — and then the style itself.
 *
 * The buttons are the only trigger for inline formatting — there is no chord
 * for bold — so this is what proves `format:<style>` is a command the editor
 * answers to.
 *
 * @covers src/ui/toolbar/index.ts, src/ui/markdown/editing/formatting.ts
 */
(async () => {
  const t = window.__t;
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const styles = [
    { label: 'Bold', raw: '**Alpha** beta.\n', source: '.markdown-strong-source', shown: '**Alpha**', tag: 'STRONG' },
    { label: 'Italic', raw: '*Alpha* beta.\n', source: '.markdown-emphasis-source', shown: '*Alpha*', tag: 'EM' },
    {
      label: 'Strikethrough',
      raw: '~~Alpha~~ beta.\n',
      source: '.markdown-delete-source',
      shown: '~~Alpha~~',
      tag: 'DEL'
    },
    {
      label: 'Inline code',
      raw: '`Alpha` beta.\n',
      source: '.markdown-inline-code-source',
      shown: '`Alpha`',
      tag: 'CODE'
    }
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
    await t.sleep(200);
    // The marked run shows its source, because the caret the button left is
    // inside it; moving the caret past the run renders the style.
    const revealed = t.prose().querySelector(style.source);
    const raw = await t.raw();
    await t.click(t.prose().querySelector('.markdown-block'), 0.99);
    await t.sleep(150);
    const element = t.prose().querySelector(style.tag.toLowerCase());
    checks[style.label] = {
      raw,
      revealed: revealed?.textContent ?? null,
      tag: element ? element.tagName : null,
      text: element ? element.textContent : null
    };
    t.report({ checks });
    if (
      raw !== style.raw ||
      checks[style.label].revealed !== style.shown ||
      checks[style.label].tag !== style.tag ||
      checks[style.label].text !== 'Alpha'
    ) {
      failed.push(style.label);
    }
  }
  return { checks, failed };
})()
