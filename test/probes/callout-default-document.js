/**
 * The default note covers both callout source forms and the main edge cases.
 *
 * @covers test/fixtures/workspace/default-document.md
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

  const kinds = [...t.prose().querySelectorAll('[data-callout-kind]')].map(
    (node) => node.dataset.calloutKind
  );
  check(
    'all five GitHub kinds render',
    ['note', 'tip', 'important', 'warning', 'caution'].every((kind) =>
      kinds.includes(kind)
    ),
    true
  );
  check(
    'the default note contains a nested callout',
    t.prose().querySelector('blockquote .markdown-callout') !== null,
    true
  );
  check(
    'the callout body renders a table',
    t.prose().querySelector('.markdown-callout-body table') !== null,
    true
  );
  check(
    'the callout body renders a code block',
    t.prose().querySelector('.markdown-callout-body pre') !== null,
    true
  );
  check(
    'the callout body renders an equation',
    t.prose().querySelector('.markdown-callout-body [data-math]') !== null,
    true
  );
  t.scroller().scrollTop = t.scroller().scrollHeight * 0.22;
  await t.sleep(300);
  check(
    'the custom fenced-Div callout renders',
    t.prose().querySelector('[data-callout-kind="definition"]') !== null,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
