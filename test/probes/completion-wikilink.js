/**
 * The wikilink list: `[[` opens the workspace's documents, the arrows move through them, and
 * Enter writes the document's id between the brackets — its name when it has no id, which is
 * what the resolver falls back to.
 *
 * The list is the workspace the app has open (`documentManager.documents()`), so the probe reads
 * it rather than assuming what is in it: it looks for a row whose value is a fourteen-digit id
 * and for one that is a name, and accepts each of them, so what is proved is the rule and not one
 * note's name. The fixture workspace has both kinds.
 *
 * The bracket pair and the citation list are `completion.js`; the two share nothing but the
 * helpers every probe defines for itself.
 *
 * @covers src/ui/markdown/syntax/completions.ts, src/ui/markdown/editing/completions.ts
 * @covers src/ui/markdown/completion_card.ts
 * @fixture test/fixtures/workspace/ — the notes the list offers: documents with a frontmatter id
 * and documents without one, which is what the two acceptances are told apart by
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
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
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range ? { text: range.startContainer.textContent, offset: range.startOffset } : null;
  };
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
  /** Opens the list at the end of `See ` and hands back the rows it offered. */
  const open = async () => {
    await t.load('See \n');
    await place(body(), 4);
    await type('[');
    await type('[');
    return rows();
  };
  /** Walks the list with the arrows until the row in hand says `matches`, or runs out. */
  const seek = async (matches, limit) => {
    for (let step = 0; step < limit; step += 1) {
      const value = highlighted();
      if (value !== null && matches(value)) {
        return value;
      }
      await type('ArrowDown');
    }
    return null;
  };

  const wikiRows = await open();
  check(
    'two brackets open a list of the workspace documents',
    cardOpen() && wikiRows.length > 0,
    { open: cardOpen(), rows: wikiRows.slice(0, 8) }
  );
  check(
    'each row shows its value and a title',
    [...document.querySelectorAll('[data-completion-row]')].every(
      (row) => (row.textContent ?? '').length >= (row.getAttribute('data-completion-row') ?? '').length
    ),
    [...document.querySelectorAll('[data-completion-row]')]
      .slice(0, 3)
      .map((row) => row.textContent)
  );
  check(
    'and a second bracket wrote the closing pair after the caret',
    [await t.raw(), caret()],
    ['See [[]]\n', { text: 'See [[]]', offset: 6 }]
  );

  const id = await seek((value) => /^\d{14}$/.test(value), Math.min(50, wikiRows.length));
  check('a document with an id is offered by that id', id !== null, {
    id,
    rows: wikiRows.slice(0, 8)
  });
  await type('Enter');
  same('and Enter writes the id between the brackets', [await t.raw(), cardOpen()], [
    `See [[${id}]]\n`,
    false
  ]);

  // A document with no frontmatter id is offered and written by its name — the resolver's own
  // fallback, so what is written is what resolves.
  await open();
  const named = await seek((value) => !/^\d{14}$/.test(value), Math.min(50, rows().length));
  check('a document with no id is offered by its name', named !== null, { named });
  await type('Enter');
  same('and Enter writes that name between the brackets', [await t.raw(), cardOpen()], [
    `See [[${named}]]\n`,
    false
  ]);

  await open();
  await type('Escape');
  same('and Escape leaves the text as the brackets wrote it', [await t.raw(), cardOpen()], [
    'See [[]]\n',
    false
  ]);

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
