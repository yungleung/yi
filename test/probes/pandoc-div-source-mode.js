/**
 * Generic Pandoc Divs stay in exact source mode; callouts still render.
 *
 * @covers src/ui/markdown/syntax/container/divs.ts,
 *   src/ui/markdown/source_mode.ts,
 *   src/ui/markdown/create_block.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const cases = [
    ['columns', '::: {.columns}\nLeft\n\nRight\n:::'],
    ['speaker notes', '::: notes\nA speaker note.\n:::'],
    [
      'nested wrapper',
      ':::: {.wrapper}\n::: {.incremental}\n- One\n- Two\n:::\n::::'
    ]
  ];

  for (const [name, source] of cases) {
    await t.load(`${source}\n`);
    const block = t.prose().querySelector('.markdown-block[data-line-start="1"]');
    const view = block?.querySelector('.markdown-fenced-div-source');
    check(`${name}: the unknown Div is exact source`, view?.textContent === source, {
      tag: view?.tagName ?? null,
      text: view?.textContent ?? null
    });
  }

  await t.load('::: {.callout .callout-note}\nRendered body.\n:::\n');
  check(
    'a known callout Div still renders its panel outside the caret',
    t.prose().querySelector('.markdown-callout') !== null &&
      t.prose().querySelector('.markdown-fenced-div-source') === null,
    t.prose().querySelector('.markdown-callout')?.textContent ?? null
  );

  await t.load('> ::: {.notes}\n> A quoted note.\n> :::\n');
  const quoted = t.prose().querySelector('.markdown-quote-source')?.textContent ?? null;
  check(
    'a generic Div inside a quote keeps the quote source always visible',
    quoted === '> ::: {.notes}\n> A quoted note.\n> :::',
    quoted
  );

  await t.load(
    ':::: {.callout .callout-note}\n::: {.incremental}\n- One\n:::\n::::\n'
  );
  const nested =
    t.prose().querySelector('.markdown-callout-source')?.textContent ?? null;
  check(
    'a callout containing an unknown Div falls back to its complete source',
    nested === ':::: {.callout .callout-note}\n::: {.incremental}\n- One\n:::\n::::',
    nested
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
