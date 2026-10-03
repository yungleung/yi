/**
 * Inline formatting is revealable: while the caret is inside a bold, italic,
 * strikethrough or inline-code run, the block shows the run's own markdown —
 * markers and all — the caret sits between the markers, and leaving the run
 * renders it again.
 *
 * @covers src/ui/markdown/nodes/strong.ts, src/ui/markdown/nodes/emphasis.ts, src/ui/markdown/nodes/delete.ts, src/ui/markdown/nodes/inline_code.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const shownAs = (selector) => t.prose().querySelector(selector);
  const tagOf = (selector) => shownAs(selector)?.tagName ?? null;
  const away = () => [...t.prose().querySelectorAll('.markdown-block')].pop();

  const styles = [
    {
      tag: 'strong',
      cls: '.markdown-strong-source',
      shown: '**a**',
      typed: '**aX** *b* ~~c~~ `d` tail\n\nend\n'
    },
    {
      tag: 'em',
      cls: '.markdown-emphasis-source',
      shown: '*b*',
      typed: '**aX** *bX* ~~c~~ `d` tail\n\nend\n'
    },
    {
      tag: 'del',
      cls: '.markdown-delete-source',
      shown: '~~c~~',
      typed: '**aX** *bX* ~~cX~~ `d` tail\n\nend\n'
    },
    {
      tag: 'code',
      cls: '.markdown-inline-code-source',
      shown: '`d`',
      typed: '**aX** *bX* ~~cX~~ `dX` tail\n\nend\n'
    }
  ];

  await t.load('**a** *b* ~~c~~ `d` tail\n\nend\n');
  for (const style of styles) {
    await t.click(shownAs(style.tag), 0.99);
    await t.sleep(200);
    check(`${style.tag} shows its markdown`, shownAs(style.cls)?.textContent ?? null, style.shown);
    check(`${style.tag} stops rendering while shown`, tagOf(style.tag), null);
    t.key('X');
    await t.sleep(250);
    check(`${style.tag} types between its markers`, await t.raw(), style.typed);
    await t.click(away(), 0.5);
    await t.sleep(250);
    check(
      `${style.tag} renders again when the caret leaves`,
      shownAs(style.cls) === null && tagOf(style.tag) === style.tag.toUpperCase(),
      true
    );
  }
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
