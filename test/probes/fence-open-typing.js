/**
 * Typing a delimiter line of its own opens the fenced block it names: ` ``` ` and `$$`
 * become both of the block's delimiter lines with the caret on the blank line between
 * them, and `---` does the same at the very top of a note — frontmatter — where anywhere
 * else it is still a thematic break. A typed ` ``` `'s label also opens the language list,
 * and choosing a language leaves the caret in the body it was in.
 *
 * @covers src/ui/markdown/editing/fence_open.ts, src/ui/markdown/editing/text_commands.ts,
 *         src/ui/markdown/editing/language_picker.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });

  /** The n-th mounted block's first element, and its classes. */
  const first = (index = 0) => t.blocks()[index]?.firstElementChild ?? null;
  const tag = (index = 0) => first(index)?.tagName ?? null;
  const classes = (index = 0) => String(first(index)?.className ?? '');
  const label = (index = 0) => {
    const element = t.blocks()[index]?.querySelector('.markdown-fence-label') ?? null;
    return element === null ? null : { tag: element.tagName, text: element.textContent };
  };

  /**
   * How far below the top of the block's body line the drawn caret sits, in pixels: within half a
   * line when it is drawn on the blank line between the fences, which is where the edit puts it (a
   * caret is the height of its text, not of the line). A caret anchored to the end of the opening
   * fence's line is drawn *on* that line instead (`caret/dom_position.ts: textNodeAtRenderedOffset`).
   */
  const caretBelowBodyLine = () => {
    const box = t.prose().querySelector('.markdown-block[data-line-start="1"]')?.firstElementChild;
    const body = box?.children?.[1] ?? null;
    const caret = t.caretRect();
    const rect = body?.getBoundingClientRect();
    return caret === null || rect === undefined ? null : Math.round(caret.y - rect.top);
  };

  /** Types a run of keys, the way the keyboard delivers them. */
  const type = async (keys) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(60);
    }
    await t.sleep(250);
  };

  /**
   * A note whose first line is empty and whose second holds text: the caret is put on the
   * empty line, with a paragraph below it to be swallowed if the fence is not closed.
   */
  const emptyFirstLine = async () => {
    await t.load('hello world\n');
    await t.click(t.blocks()[0], 0.5, 0.5);
    await t.sleep(120);
    for (let step = 0; step < 40; step += 1) {
      t.key('ArrowLeft');
    }
    await t.sleep(150);
    t.key('Enter');
    await t.sleep(250);
  };

  // `---` at the very top of the note: frontmatter, closed, with the caret between the fences.
  await emptyFirstLine();
  await type(['-', '-', '-']);
  check('a typed `---` at the top makes frontmatter', await t.raw(), '---\n\n---\n\nhello world\n');
  check('and the block is the frontmatter fence', tag(), 'PRE');
  check('with its own kind on it', classes().includes('markdown-frontmatter'), true);
  check('and its label', label(), { tag: 'SPAN', text: 'YAML Frontmatter' });
  check('and the caret is drawn on the body’s blank line', Math.abs(caretBelowBodyLine() ?? 99) <= 8, true);
  t.key('Q');
  await t.sleep(250);
  check('the caret was on the blank line between the fences', await t.raw(), '---\nQ\n---\n\nhello world\n');

  // A typed ` ``` ` closes itself off, so the paragraph below it is not code.
  await emptyFirstLine();
  await type(['`', '`', '`']);
  check('a typed ` ``` ` makes a closed code fence', await t.raw(), '```\n\n```\n\nhello world\n');
  check('and the caret is drawn on the body’s blank line', Math.abs(caretBelowBodyLine() ?? 99) <= 8, true);
  check('and the block is the code fence', classes().includes('markdown-fenced-code'), true);
  check('its label asks for the language', label(), { tag: 'BUTTON', text: 'text' });
  const rows = [...document.querySelectorAll('[data-language]')];
  check('and the list of languages is open beside it', rows.length > 100, true);
  check(
    'with highlight.js’s own names in it',
    ['javascript', 'python'].every((name) => rows.some((row) => row.dataset.language === name)),
    true
  );
  check(
    'and `text` for the fence that names none',
    rows.find((row) => row.dataset.language === '')?.textContent ?? null,
    'text'
  );
  check(
    'and `text` — the language the fence names — shown as the current one',
    rows.find((row) => row.dataset.language === '')?.className.includes('bg-base-300') ?? null,
    true
  );
  rows.find((row) => row.dataset.language === 'python')?.click();
  await t.sleep(300);
  check('choosing a language names the fence', await t.raw(), '```python\n\n```\n\nhello world\n');
  t.key('Q');
  await t.sleep(250);
  check('and the caret stayed in the body below the fence', await t.raw(), '```python\nQ\n```\n\nhello world\n');

  // A typed `$$` closes itself off the same way.
  await emptyFirstLine();
  await type(['$', '$']);
  check('a typed `$$` makes a closed display formula', await t.raw(), '$$\n\n$$\n\nhello world\n');
  check('and the caret is drawn on the body’s blank line', Math.abs(caretBelowBodyLine() ?? 99) <= 8, true);
  check('with the formula’s own label, as its source is shown', label(), { tag: 'SPAN', text: 'latex' });
  t.key('Q');
  await t.sleep(250);
  check('and the caret was on the blank line between the fences', await t.raw(), '$$\nQ\n$$\n\nhello world\n');

  // `[$$` opens a labeled display-math span with an editable attribute placeholder.
  await emptyFirstLine();
  await type(['[', '$', '$']);
  check(
    'a typed `[$$` makes a closed labeled equation',
    await t.raw(),
    '[$$\n\n$$]{}\n\nhello world\n'
  );
  t.key('Q');
  await t.sleep(250);
  check(
    'and the caret was on the labeled equation body line',
    await t.raw(),
    '[$$\nQ\n$$]{}\n\nhello world\n'
  );

  // Anything else is ordinary typing.
  await emptyFirstLine();
  await type(['-', '-']);
  check('two dashes stay two dashes', await t.raw(), '--\n\nhello world\n');
  check('and the block is a paragraph', tag(), 'P');

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
