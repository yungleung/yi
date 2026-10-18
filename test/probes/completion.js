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
 * @needs-workspace — the fixture bibliography has to be the one the app has loaded
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
  /** The popover's own box, which must not move while the list is walked. */
  const cardBox = () => {
    const box = document.querySelector('[data-completion]')?.getBoundingClientRect();
    return box
      ? {
          left: Math.round(box.left),
          top: Math.round(box.top),
          width: Math.round(box.width),
          height: Math.round(box.height)
        }
      : null;
  };
  /**
   * The first row against the card it is drawn in: a row is the card's own interior — the border
   * and nothing else between them — and nothing of it spills past the card.
   */
  const rowFit = () => {
    const card = document.querySelector('[data-completion]');
    const row = card?.querySelector('[data-completion-row]');
    if (!card || !row) {
      return null;
    }
    const outer = card.getBoundingClientRect();
    const inner = row.getBoundingClientRect();
    return {
      insetLeft: Math.round(inner.left - outer.left),
      insetRight: Math.round(outer.right - inner.right),
      border: getComputedStyle(card).borderLeftWidth,
      rowWidth: Math.round(inner.width),
      cardWidth: Math.round(outer.width),
      spill: card.scrollWidth - card.clientWidth
    };
  };
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
  const fit = rowFit();
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
  // A row has no margin or padding of its own: what separates it from the popover is the popover's
  // border, on both sides, and a title longer than the card is ellipsized rather than pushing the
  // row out past it (measured: 417px of row inside a 288px card before this).
  check(
    'and each row is the popover’s own width, flush to its border',
    fit !== null &&
      fit.insetLeft === fit.insetRight &&
      `${fit.insetLeft}px` === fit.border &&
      fit.spill === 0 &&
      fit.rowWidth <= fit.cardWidth,
    fit
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
  const before = cardBox();
  await type('ArrowDown');
  check('the arrows move the entry in hand', cardOpen() && highlighted() !== null, {
    first,
    after: highlighted(),
    rows: rows()
  });
  // The card is placed from the caret's *range*, not from the span that draws it: the span is a
  // frame behind, and a card placed from it opens one character to the left and slides across on
  // the first ArrowDown (measured: 430px, then 444px).
  check('and they move the entry, not the popover', cardBox(), before);
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
