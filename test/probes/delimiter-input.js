/**
 * Colon fences wait for their delimiter space, while a code fence collects
 * its language in the opening line and filters the picker from both keydown
 * and input-method commits without moving the caret out of that line. The
 * first case edits the default document under its Code instructions.
 *
 * @covers src/ui/markdown/editing/fence_open.ts,
 *   src/ui/markdown/editing/language_picker.ts,
 *   src/ui/markdown/choice_card.ts
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
  const emptyFirstLine = async () => {
    await t.load('hello world\n');
    await t.click(t.blocks()[0], 0.5, 0.5);
    for (let step = 0; step < 40; step += 1) {
      t.key('ArrowLeft');
    }
    t.key('Enter');
    await t.sleep(220);
  };
  const type = async (keys) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(70);
    }
    await t.sleep(220);
  };
  const visible = (selector) =>
    [...document.querySelectorAll(selector)].filter(
      (row) => row.closest('.hidden') === null
    );
  const languageRows = () => visible('[data-language]');
  const commitText = async (text) => {
    const seam = document.querySelector('.markdown-composition-input');
    if (!(seam instanceof HTMLTextAreaElement)) {
      return false;
    }
    seam.value = text;
    seam.dispatchEvent(
      new InputEvent('input', {
        data: text,
        inputType: 'insertText',
        bubbles: true
      })
    );
    await t.sleep(220);
    return true;
  };

  const fixture = await t.raw();
  const instruction = [...t.prose().querySelectorAll('p')].find((paragraph) =>
    paragraph.textContent?.startsWith('Typing three backticks on an empty line')
  );
  if (instruction) {
    instruction.scrollIntoView({ block: 'center' });
    await t.sleep(200);
    const blocks = t.blocks();
    const instructionIndex = blocks.findIndex(
      (block) => block.textContent?.startsWith('Typing three backticks on an empty line')
    );
    const blank = blocks
      .slice(instructionIndex + 1)
      .find((block) => block.querySelector('.markdown-empty-line-placeholder'));
    if (blank) {
      await t.click(blank);
    } else {
      await t.click(instruction);
      t.key('Enter');
      await t.sleep(160);
    }
    await type(['`', '`', '`', 'p', 'y', ' ', '{', '#', 'x', '}']);
    const edited = await t.raw();
    check(
      'the default Code section opens a filtered fence where its instructions stand',
      edited.includes('```py {#x}\n\n```\n\n```ts'),
      true
    );
  }

  await emptyFirstLine();
  await type([':', ':', ':', ':']);
  check(
    'colons without their delimiter space remain ordinary source',
    await t.raw(),
    '::::\n\nhello world\n'
  );
  check(
    'and no Div-kind picker opens yet',
    visible('[data-div-kind-choice]').length,
    0
  );

  await emptyFirstLine();
  await type([':', ':', ':', ':', ' ']);
  check(
    'a space after the colons creates a matching four-colon Div pair',
    await t.raw(),
    '::::\n\n::::\n\nhello world\n'
  );
  check(
    'and opens the Div-kind picker',
    visible('[data-div-kind-choice]').length,
    9
  );
  t.key('X');
  await t.sleep(220);
  check(
    'and leaves the caret immediately after the opening colon fence',
    await t.raw(),
    '::::X\n\n::::\n\nhello world\n'
  );
  await emptyFirstLine();
  await type(['`', '`', '`']);
  check(
    'and the language picker is open there',
    languageRows().length > 100,
    true
  );
  await type(['X']);
  check(
    'a code fence opens with the caret after its opening backticks',
    await t.raw(),
    '```X\n\n```\n\nhello world\n'
  );

  await emptyFirstLine();
  await type(['`', '`', '`']);
  await type(['p', 'y']);
  check('and the language choices are filtered', languageRows().map((row) => row.dataset.language), [
    'python',
    'python-repl'
  ]);
  t.key('ArrowDown');
  await t.sleep(100);
  t.key('Enter');
  await t.sleep(220);
  await type(['X']);
  check(
    'typed language characters filter the choices and Enter stays on the opening line',
    await t.raw(),
    '```python-replX\n\n```\n\nhello world\n'
  );

  await emptyFirstLine();
  const fenceCommits = [];
  for (let typed = 0; typed < 3; typed += 1) {
    fenceCommits.push(await commitText('`'));
  }
  check(
    'a committed fence marker opens the unfiltered language picker',
    {
      committed: fenceCommits.every(Boolean),
      open: languageRows().length > 100,
      raw: await t.raw()
    },
    {
      committed: true,
      open: true,
      raw: '```\n\n```\n\nhello world\n'
    }
  );

  await emptyFirstLine();
  await type(['`', '`', '`']);
  check(
    'a textarea commit filters the open language choices too',
    {
      committed: await commitText('py'),
      rows: languageRows().map((row) => row.dataset.language)
    },
    {
      committed: true,
      rows: ['python', 'python-repl']
    }
  );
  const committedSpace = await commitText(' ');
  check(
    'and a committed space closes them while staying in the opening line',
    {
      committed: committedSpace,
      rows: languageRows().length,
      raw: await t.raw()
    },
    {
      committed: true,
      rows: 0,
      raw: '```py \n\n```\n\nhello world\n'
    }
  );

  await emptyFirstLine();
  await type(['`', '`', '`', 'p', 'y', ' ']);
  check(
    'space closes the picker, is written as source, and stays on the opening line',
    await t.raw(),
    '```py \n\n```\n\nhello world\n'
  );
  check(
    'and no language choices remain open',
    languageRows().filter((row) => !row.closest('.hidden')).length,
    0
  );
  await type(['{', '#', 'x', '}']);
  check(
    'the space and following attributes stay in the opening fence',
    await t.raw(),
    '```py {#x}\n\n```\n\nhello world\n'
  );

  await emptyFirstLine();
  await type(['`', '`', '`', 'p', 'y']);
  t.key('Escape');
  await t.sleep(180);
  await type(['X']);
  check(
    'Escape dismisses choices and leaves the caret on the opening line',
    await t.raw(),
    '```pyX\n\n```\n\nhello world\n'
  );

  await t.load('::: {.callout .callout-note}\n\n:::\n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(150);
  const openingEnd = '::: {.callout .callout-note}\n'.length;
  const source = t.prose().querySelector('.markdown-callout-source');
  const node = source === null ? null : t.textNodesIn(source)[0];
  if (node) {
    const range = document.createRange();
    range.setStart(node, openingEnd);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + 0.5,
      clientY: box.top + box.height / 2
    };
    node.parentElement.dispatchEvent(new PointerEvent('pointerdown', event));
    node.parentElement.dispatchEvent(new PointerEvent('pointerup', event));
    node.parentElement.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(150);
  }
  await type([':', ':', ':', ':', ':', ' ']);
  document
    .querySelector('[data-div-kind-choice="callout:warning"]')
    ?.click();
  await t.sleep(220);
  check(
    'a nested five-colon Div keeps its outer attributes untouched',
    await t.raw(),
    '::: {.callout .callout-note}\n\n::::: {.callout .callout-warning}\n\n:::::\n\n\n:::\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
