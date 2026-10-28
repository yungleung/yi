/**
 * GitHub and Div callouts render the same panel and reveal exact source.
 *
 * @covers src/ui/markdown/nodes/callout.ts,
 *   src/ui/markdown/nodes/callout_source.ts,
 *   src/ui/markdown/create_block.ts
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

  for (const [name, markdown, title] of [
    ['GitHub alert', '> [!WARNING]\n> First\n>\n> Second\n', 'Warning'],
    [
      'fenced Div',
      '::: {.callout .callout-note title="Notice"}\nFirst\n\nSecond\n:::\n',
      'Notice'
    ]
  ]) {
    await t.load(markdown);
    const panel = t.prose().querySelector('.markdown-callout');
    check(`${name}: panel renders`, panel !== null, true);
    check(
      `${name}: title renders`,
      panel?.querySelector('.markdown-callout-title')?.textContent ?? null,
      title
    );
    check(
      `${name}: body keeps both paragraphs`,
      panel?.querySelectorAll('.markdown-callout-body p').length ?? 0,
      2
    );
    if (panel) {
      await t.click(panel, 0.5);
      await t.sleep(250);
    }
    const source = t.prose().querySelector('.markdown-callout-source');
    check(`${name}: panel becomes exact source`, source?.textContent ?? null, markdown.trimEnd());
    check(
      `${name}: source starts at the block source offset`,
      source?.getAttribute('data-text-from') ?? null,
      '0'
    );
  }

  await t.load('> > [!TIP]\n> > Nested\n');
  check(
    'an outer quote remains around the rendered callout',
    t.prose().querySelector('blockquote > .markdown-callout') !== null,
    true
  );

  const nestedAfterProse = '> Intro\n> > [!TIP]\n> > Nested\n';
  await t.load(nestedAfterProse);
  const nestedPanel = t.prose().querySelector('.markdown-callout');
  if (nestedPanel) {
    await t.click(nestedPanel, 0.5);
    await t.sleep(250);
  }
  check(
    'a nested callout after quoted prose reveals its exact block source',
    t.prose().querySelector('.markdown-quote-source')?.textContent ?? null,
    nestedAfterProse.trimEnd()
  );

  await t.load('> > [!TIP]\n> > Inner\n>\n> Outer after\n');
  check(
    'a nested callout ends before outer quote content',
    t.prose().querySelector('.markdown-callout')?.dataset.calloutKind ?? null,
    'tip'
  );
  check(
    'outer quote content remains after that callout',
    [...t.prose().querySelectorAll('p')].some((node) => node.textContent === 'Outer after'),
    true
  );

  await t.load('> Ordinary quote\n');
  check(
    'an ordinary quote does not become a callout',
    t.prose().querySelector('.markdown-callout'),
    null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
