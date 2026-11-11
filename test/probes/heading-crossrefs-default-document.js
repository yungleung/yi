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

  const hrefs = [
    '#automatic-heading-ids',
    '#automatic-heading-ids-1',
    '#reading-methods',
    '#setext-heading'
  ];
  const link = (href) => t.prose().querySelector(`a.markdown-link[href="${href}"]`);
  for (let fraction = 0.1; fraction <= 1.0001; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    if (hrefs.every((href) => link(href) !== null)) {
      break;
    }
  }

  check(
    'the fixture names all four destinations',
    hrefs.every((href) => link(href) !== null),
    true
  );
  const follow = async (href, id) => {
    let anchor = null;
    for (let fraction = 0.1; fraction <= 1.0001 && anchor === null; fraction += 0.02) {
      t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
      await t.sleep(100);
      anchor = link(href);
    }
    if (anchor === null) {
      return null;
    }
    commandClick(anchor);
    for (let attempt = 0; attempt < 30 && target(id) === undefined; attempt += 1) {
      await t.sleep(100);
    }
    return target(id) ?? null;
  };

  const automatic = await follow('#automatic-heading-ids', 'automatic-heading-ids');
  const duplicate = await follow('#automatic-heading-ids-1', 'automatic-heading-ids-1');
  const methods = await follow('#reading-methods', 'reading-methods');
  check(
    'automatic, duplicate and custom IDs are reachable',
    [automatic?.tagName ?? null, duplicate?.tagName ?? null, methods?.tagName ?? null],
    ['H3', 'H3', 'H3']
  );

  const source = methods?.querySelector(
    '.markdown-heading-attributes-source'
  );
  check(
    'the custom heading reveals all three attribute kinds',
    source?.textContent ?? null,
    '{#reading-methods .unnumbered data-owner=demo}'
  );

  const setext = await follow('#setext-heading', 'setext-heading');
  check(
    'the setext destination resolves to its level-one heading',
    setext?.tagName ?? null,
    'H1'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
