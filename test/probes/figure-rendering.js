/**
 * Figures render their captions, numbers, IDs, and complete editable source.
 *
 * @covers src/ui/markdown/nodes/figure.ts,
 *   src/ui/markdown/document/reference_index.ts,
 *   src/ui/markdown/nodes/auto_reference.ts
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

  await t.load(
    '# Figures\n\n' +
      'An inline ![tiny](https://placehold.co/40x20/png) sits with this text.\n\n' +
      '![Opening](https://placehold.co/200x80/png)\n\n' +
      'See [#fig:model].\n\n' +
      '![Model overview](https://placehold.co/200x80/png){#fig:model .wide width=80%}\n'
  );
  const figures = [...t.prose().querySelectorAll('figure.markdown-figure')];
  const inline = t.prose().querySelector('p img');
  const inlineStyle = inline === null ? null : getComputedStyle(inline);
  const inlineRect = inline?.getBoundingClientRect() ?? null;
  const followingText = inline?.nextElementSibling;
  const followingRect = followingText?.getBoundingClientRect() ?? null;
  const sharesLine =
    inlineRect !== null &&
    followingRect !== null &&
    followingRect.left >= inlineRect.right - 1 &&
    followingRect.top < inlineRect.bottom &&
    followingRect.bottom > inlineRect.top;
  check('an inline image stays inside its paragraph', inline?.closest('figure') ?? null, null);
  check('and is laid out in the text line', inlineStyle?.display ?? null, 'inline-block');
  check('and shares its line with the following text', sharesLine, true);
  check('without figure caption margins', [inlineStyle?.marginTop, inlineStyle?.marginBottom], ['0px', '0px']);
  check('both implicit figures render', figures.length, 2);
  check(
    'the unlabeled figure consumes Figure 1',
    figures[0]?.querySelector('.markdown-figure-number')?.textContent ?? null,
    'Figure 1.'
  );
  check(
    'the labeled figure consumes Figure 2',
    figures[1]?.querySelector('.markdown-figure-number')?.textContent ?? null,
    'Figure 2.'
  );
  check('only the labeled figure carries an ID', figures[1]?.id ?? null, 'fig:model');
  check('arbitrary classes stay out of the editor DOM', figures[1]?.classList.contains('wide'), false);
  check(
    'the caption contains its text',
    figures[1]?.querySelector('figcaption')?.textContent?.trim() ?? null,
    'Figure 2. Model overview'
  );
  check(
    'the automatic reference infers the figure label',
    t.prose().querySelector('[data-auto-reference]')?.textContent ?? null,
    'Figure 2'
  );

  await t.click(figures[1], 0.5);
  await t.sleep(250);
  check(
    'clicking the figure reveals its complete source',
    t.prose().querySelector('.markdown-figure-source')?.textContent ?? null,
    '![Model overview](https://placehold.co/200x80/png){#fig:model .wide width=80%}'
  );

  await t.click(t.prose().querySelector('h1'), 0.5);
  await t.sleep(250);
  check(
    'leaving the figure restores its rendering',
    t.prose().querySelectorAll('figure.markdown-figure').length,
    2
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
