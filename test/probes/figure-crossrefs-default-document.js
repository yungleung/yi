/**
 * The default fixture demonstrates figure numbering, captions, and references.
 *
 * @covers test/fixtures/workspace/default-document.md
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected, detail = actual) =>
    checks.push({
      name,
      actual: detail,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  // Walk down the virtualised document until the figure section is mounted; a short Linux
  // viewport can otherwise still be showing blocks above it.
  for (let fraction = 0.1; fraction <= 1.0001; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    if (
      t.prose().querySelector('[data-auto-reference="fig:sample"]') !== null &&
      t.prose().querySelector('figure[id="fig:sample"]') !== null
    ) {
      break;
    }
  }

  const reference = t.prose().querySelector('[data-auto-reference="fig:sample"]');
  const figure = t.prose().querySelector('figure[id="fig:sample"]');
  check('the figure reference resolves to Figure 2-2', reference?.textContent ?? null, 'Figure 2-2');
  check('the labeled figure renders its caption', figure?.querySelector('figcaption')?.textContent?.trim() ?? null, 'Figure 2-2. A sample image');
  check(
    'the inline image does not become a figure',
    t.prose().querySelectorAll('figure.markdown-figure').length,
    2
  );

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
    caret !== null && box !== null && caret.y >= box.top - 6 && caret.y <= box.bottom + 6,
    true,
    { caret, box }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
