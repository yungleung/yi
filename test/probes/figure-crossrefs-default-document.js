/**
 * The default fixture demonstrates figure numbering, captions, and references.
 *
 * @covers test/fixtures/workspace/default-document.md
 * @fixture test/fixtures/workspace/default-document.md
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

  t.scroller().scrollTop = t.scroller().scrollHeight;
  await t.sleep(400);

  const reference = t.prose().querySelector('[data-auto-reference="fig:sample"]');
  const figure = t.prose().querySelector('figure[id="fig:sample"]');
  check('the figure reference resolves to Figure 2', reference?.textContent ?? null, 'Figure 2');
  check('the labeled figure renders its caption', figure?.querySelector('figcaption')?.textContent?.trim() ?? null, 'Figure 2. A sample image');
  check('the inline image does not become a figure', t.prose().querySelectorAll('figure').length, 2);

  if (reference) {
    const box = reference.getBoundingClientRect();
    reference.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (
        t.prose().querySelector('.markdown-figure-source') !== null &&
        t.caretRect() !== null
      ) {
        break;
      }
      await t.sleep(100);
    }
  }
  const source = t.prose().querySelector('.markdown-figure-source');
  const caret = t.caretRect();
  const box = source?.getBoundingClientRect() ?? null;
  check(
    'command-click focuses the figure source',
    source !== null,
    true
  );
  check(
    'with the caret at the figure',
    caret !== null && box !== null && caret.y >= box.top - 4 && caret.y <= box.bottom + 4,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
