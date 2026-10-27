/**
 * A fast burst typed into highlighted source stays in one live editor block.
 *
 * A fenced block's source is highlighted into several text nodes. Falling back
 * to a full block rebuild for every character detaches the focused source and
 * asks the input seam to hand back the keyboard on the next frame, which is
 * where fast physical typing loses characters and the caret visibly jumps.
 * This drives the same key path at burst speed and holds the source element,
 * focus, and complete text through the run.
 *
 * @covers src/ui/markdown/editing/typed_text.ts,
 *   src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/markdown_editor.ts,
 *   src/ui/markdown/editing/composition_input.ts
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const typed = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
  const doc = ['Before.', '', '```js', 'let x = 1', '```', '', 'After.', ''].join('\n');

  await t.load(doc);
  const initialCode = t.blocks()
    .find((element) => element.querySelector('pre'))
    ?.querySelector('pre');
  await t.click(initialCode, 0.72, 0.6);
  await t.sleep(350);

  const source = () =>
    t.blocks().find((element) => element.querySelector('pre'))?.querySelector('pre') ?? null;
  const sourceBefore = source();
  const seam = document.querySelector('.markdown-composition-input');
  let focusLosses = 0;
  document.addEventListener(
    'focusout',
    (event) => {
      if (event.target === seam) {
        focusLosses += 1;
      }
    },
    true
  );
  let caretGaps = 0;
  caret.onCaretRangeChanged((range) => {
    if (range === null) {
      caretGaps += 1;
    }
  });

  for (const character of typed) {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: character, bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await t.sleep(300);

  const sourceAfter = source();
  const raw = await t.raw();
  check(
    'a fast source burst keeps every character',
    raw,
    `Before.\n\n\`\`\`js\nlet x = 1${typed}\n\`\`\`\n\nAfter.\n`
  );
  check('the source box survives the burst', sourceAfter === sourceBefore, true);
  check('the input seam never loses focus during the burst', focusLosses, 0);
  check('the caret never disappears during the burst', caretGaps, 0);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
