/**
 * Heading attributes hide outside their heading and remain editable inside it.
 *
 * @covers src/ui/markdown/nodes/heading.ts, src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/render_context.ts
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

  await t.load('# Before\n\n## Methods {#methods .unnumbered}\n\nAfter\n');
  let heading = t.prose().querySelector('h2');
  check('attributes are hidden outside the heading', heading.textContent.trim(), 'Methods');
  check('the heading carries its custom id', heading.id, 'methods');

  await t.click(heading, 0.5);
  await t.sleep(250);
  let source = t.prose().querySelector('.markdown-heading-attributes-source');
  check(
    'attributes appear inside the heading',
    source?.textContent ?? null,
    '{#methods .unnumbered}'
  );

  const sourceLeft = source?.getBoundingClientRect().left ?? null;
  t.key('ArrowLeft');
  await t.sleep(250);
  check(
    'one left from the attributes leaves their block',
    sourceLeft !== null && (t.caretRect()?.x ?? sourceLeft) < sourceLeft - 2,
    true
  );

  await t.load('# Before\n\n## Methods {#methods .unnumbered}\n\nAfter\n');
  heading = t.prose().querySelector('h2');
  await t.click(heading, 0.5);
  await t.sleep(250);
  source = t.prose().querySelector('.markdown-heading-attributes-source');
  if (source) {
    await t.click(source, 0.4);
    t.key('x');
    await t.sleep(250);
  }
  const typed = await t.raw();
  check(
    'typing lands in the attribute source',
    typed.includes('## Methods {#methodsx .unnumbered}'),
    true
  );

  const before = t.prose().querySelector('h1');
  await t.click(before, 0.5);
  await t.sleep(250);
  check(
    'attributes hide again after leaving the heading',
    t.prose().querySelector('.markdown-heading-attributes-source'),
    null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
