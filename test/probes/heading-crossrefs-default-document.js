/**
 * The default fixture demonstrates every heading cross-reference form.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/references.ts
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
  const commandClick = (anchor) => {
    const box = anchor.getBoundingClientRect();
    return anchor.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
  };
  const target = (id) =>
    [...t.prose().querySelectorAll('h1,h2,h3,h4,h5,h6')].find(
      (heading) => heading.id === id
    );

  t.scroller().scrollTop = t.scroller().scrollHeight;
  await t.sleep(400);

  check(
    'the fixture names all four destinations',
    ['#automatic-heading-ids', '#automatic-heading-ids-1', '#reading-methods', '#setext-heading'].every(
      (href) => t.prose().querySelector(`a.markdown-link[href="${href}"]`) !== null
    ),
    true
  );
  check(
    'automatic, duplicate, custom and setext IDs are rendered',
    [
      target('automatic-heading-ids') !== undefined,
      target('automatic-heading-ids-1') !== undefined,
      target('reading-methods') !== undefined,
      target('setext-heading') !== undefined
    ],
    [true, true, true, true]
  );

  commandClick(t.prose().querySelector('a.markdown-link[href="#reading-methods"]'));
  await t.sleep(300);
  const source = target('reading-methods')?.querySelector(
    '.markdown-heading-attributes-source'
  );
  check(
    'the custom heading reveals all three attribute kinds',
    source?.textContent ?? null,
    '{#reading-methods .unnumbered data-owner=demo}'
  );

  commandClick(t.prose().querySelector('a.markdown-link[href="#setext-heading"]'));
  await t.sleep(300);
  check(
    'the setext destination resolves to its level-one heading',
    target('setext-heading')?.tagName ?? null,
    'H1'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
