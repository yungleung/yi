/**
 * Ordinary quotes use a generous two-sided inset and one oversized opening
 * quotation mark, without the default side border or closing quote glyph.
 *
 * @covers src/styles.css
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

  await t.load('> A quoted paragraph.\n>\n> A second paragraph.\n');
  const quote = t.prose().querySelector('blockquote');
  const first = quote?.querySelector('p');
  const quoteStyle = quote === null ? null : getComputedStyle(quote);
  const openingStyle = quote === null ? null : getComputedStyle(quote, '::before');
  const firstBefore = first === null ? null : getComputedStyle(first, '::before');
  const lastAfter = quote === null
    ? null
    : getComputedStyle(quote.querySelector('p:last-of-type'), '::after');

  check('the default thick side rule is gone', quoteStyle?.borderInlineStartWidth ?? null, '0px');
  check(
    'the quote is inset and padded from both sides',
    quoteStyle !== null &&
      parseFloat(quoteStyle.marginInlineStart) > 0 &&
      parseFloat(quoteStyle.marginInlineEnd) > 0 &&
      parseFloat(quoteStyle.paddingInlineStart) > 0 &&
      parseFloat(quoteStyle.paddingInlineEnd) > 0,
    true
  );
  check(
    'the opening decoration is a quotation mark',
    openingStyle?.content.includes('“') ?? false,
    true
  );
  check(
    'the opening decoration is visually larger than the quote',
    openingStyle !== null &&
      quoteStyle !== null &&
      parseFloat(openingStyle.fontSize) > parseFloat(quoteStyle.fontSize) * 2,
    true
  );
  check('the old inline opening glyph is removed', firstBefore?.content ?? null, 'none');
  check('the old closing glyph is removed', lastAfter?.content ?? null, 'none');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
