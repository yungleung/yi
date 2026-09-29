/**
 * The bracket pair, the citation list and the wikilink list, driven the way an author drives them.
 *
 * The rules themselves are held in Node (check-brackets and check-completions). This is the living
 * half: the keys that reach them, the card that opens beside the caret, the arrows that move
 * through it, and the text left behind when Enter accepts.
 *
 * The citation list is the bibliography the app has loaded — the fixtures' zotero.bib under the
 * harness — and the wikilink list is the documents of the workspace the app has open. The probe
 * reads the list rather than assuming what is in it: it looks for a row whose value is a
 * fourteen-digit id and accepts that one, so what is proved is the rule and not one note's name.
 *
 * @covers src/ui/markdown/syntax/brackets.ts, src/ui/markdown/syntax/completions.ts
 * @covers src/ui/markdown/editing/completions.ts, src/ui/markdown/completion_card.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  const card = () => document.querySelector('[data-completion]');
  const cardOpen = () => card()?.classList.contains('hidden') === false;
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
    await t.sleep(150);
  };
  const type = async (key) => {
    t.key(key);
    await t.sleep(200);
  };

  await t.load('abc\n');
  await place(body(), 1);
  await type('[');
  same('a bracket writes its pair, with the caret inside', [await t.raw(), caret()], [
    'a[]bc\n',
    { text: 'a[]bc', offset: 2 }
  ]);
  await type('[');
  same('and a second one makes two pairs with the caret between them', [await t.raw(), caret()], [
    'a[[]]bc\n',
    { text: 'a[[]]bc', offset: 3 }
  ]);
  await type(']');
  same('typing the bracket already there steps over it', [await t.raw(), caret()], [
    'a[[]]bc\n',
    { text: 'a[[]]bc', offset: 4 }
  ]);
  await t.load('abc\n');
  await place(body(), 1);
  await type('[');
  t.key('Backspace');
  await t.sleep(200);
  same('and Backspace takes an empty pair away whole', await t.raw(), 'abc\n');
  await t.load('```\ncode\n```\n');
  await place(t.textNodesIn(t.blocks()[0])[0], 1);
  await type('[');
  same('no pair is written inside a fenced code block', await t.raw(), '```\n[code\n```\n');

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

  await t.load('See \n');
  await place(body(), 4);
  await type('[');
  await type('[');
  const wikiRows = rows();
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
  let id = null;
  for (let step = 0; step < Math.min(50, wikiRows.length); step += 1) {
    if (/^\d{14}$/.test(highlighted() ?? '')) {
      id = highlighted();
      break;
    }
    await type('ArrowDown');
  }
  check('a document with an id is offered by that id', id !== null, {
    id,
    rows: wikiRows.slice(0, 8)
  });
  await type('Enter');
  same('and Enter writes the id between the brackets', [await t.raw(), cardOpen()], [
    `See [[${id}]]\n`,
    false
  ]);

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()
