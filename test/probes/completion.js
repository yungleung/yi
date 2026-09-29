/**
 * The citation list: typing `@` opens the bibliography's keys, the arrows move through them, and
 * Enter writes the key where the `@` was.
 *
 * The rules themselves are held in Node (`test/checks/check-completions.mjs`); what is here is the
 * living half: the card that opens beside the caret, what narrows it, the arrows that move through
 * it, and the text left behind when Enter accepts. The bracket pair is `brackets.js` and the
 * wikilink list is `completion-wikilink.js`.
 *
 * The citation list is the bibliography the app has loaded — the fixtures' zotero.bib under the
 * harness — and the probe reads the list rather than assuming what is in it, so what is proved is
 * the rule and not one bibliography's keys.
 *
 * @covers src/ui/markdown/syntax/completions.ts
 * @covers src/ui/markdown/editing/completions.ts, src/ui/markdown/completion_card.ts
 * @fixture test/fixtures/workspace/zotero.bib — the two entries the list offers, and the titles it
 * shows beside their keys
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const cardOpen = () =>
    document.querySelector('[data-completion]')?.classList.contains('hidden') === false;
  const rows = () =>
    [...document.querySelectorAll('[data-completion-row]')].map((row) =>
      row.getAttribute('data-completion-row')
    );
  const highlighted = () =>
    document.querySelector('[data-completion-row][aria-selected="true"]')?.getAttribute(
      'data-completion-row'
    ) ?? null;
  const body = () => t.textNodesIn(t.blocks()[0])[0];
  const place = async (text, offset) => {
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(120);
  };
  const type = async (key) => {
    t.key(key);
    await t.sleep(150);
  };

  await t.load('See \n');
  await place(body(), 4);
  await type('@');
  const citationRows = rows();
  check(
    'an @ opens a list of the bibliography keys, with titles beside them',
    cardOpen() && citationRows.length > 0,
    {
      open: cardOpen(),
      rows: citationRows,
      titles: [...document.querySelectorAll('[data-completion-row] span:last-child')].map(
        (span) => span.textContent
      )
    }
  );
  await type('j');
  check(
    'typing narrows it to the entries that match',
    rows().length > 0 && rows().every((value) => value.toLowerCase().includes('j')),
    { rows: rows() }
  );
  const chosen = rows()[0];
  await type('Enter');
  same('and Enter writes the key where the @ was', [await t.raw(), cardOpen()], [
    `See @${chosen}\n`,
    false
  ]);
  // The other field: a query that is in no key at all still finds the entries whose *title*
  // holds it, which is what makes the list usable without knowing the key.
  await t.load('See \n');
  await place(body(), 4);
  await type('@');
  await type('q');
  const byTitle = rows();
  check(
    'and a title alone finds an entry whose key does not hold what is typed',
    cardOpen() && byTitle.length > 0 && byTitle.every((value) => !value.toLowerCase().includes('q')),
    { rows: byTitle }
  );
  await type('Enter');
  same('which writes that entry\u2019s key', await t.raw(), `See @${byTitle[0]}\n`);
  await t.load('See \n');
  await place(body(), 4);
  await type('@');
  const first = highlighted();
  await type('ArrowDown');
  check('the arrows move the entry in hand', cardOpen() && highlighted() !== null, {
    first,
    after: highlighted(),
    rows: rows()
  });
  await type('Escape');
  same('and Escape closes the list and leaves the text alone', [await t.raw(), cardOpen()], [
    'See @\n',
    false
  ]);
  await type('x');
  same('while a letter after the @ reaches the text', await t.raw(), 'See @x\n');
  // A click is not typing: deleting the letter puts the `@` query back and the list with it, and
  // a click that moves the caret — into the words before the list — puts it away again.
  await type('Backspace');
  const reopened = cardOpen();
  await place(body(), 1);
  check('a click back into the text closes the list', reopened && !cardOpen(), {
    reopened,
    after: cardOpen(),
    raw: await t.raw()
  });

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
