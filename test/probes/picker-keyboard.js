/**
 * The language and Div-kind pickers select with the arrow keys and Enter,
 * without moving the document caret.
 *
 * @covers src/ui/markdown/editing/language_picker.ts,
 *   src/ui/markdown/editing/callout_kind_picker.ts
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
  const activeRow = (selector) =>
    [...document.querySelectorAll(selector)].find((row) =>
      row.classList.contains('bg-base-300')
    ) ?? null;
  const press = (name) => {
    const target = document.activeElement?.dispatchEvent
      ? document.activeElement
      : t.scroller();
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
        cancelable: true
      })
    );
  };

  await t.load('```python\nprint(1)\n```\n');
  t.prose().querySelector('.markdown-fence-label')?.click();
  await t.sleep(180);
  const languageRows = [...document.querySelectorAll('[data-language]')];
  const python = languageRows.findIndex((row) => row.dataset.language === 'python');
  const nextLanguage = languageRows[python + 1]?.dataset.language ?? null;
  check('the language picker starts on the current language', activeRow('[data-language]')?.dataset.language ?? null, 'python');
  press('ArrowDown');
  await t.sleep(100);
  check('ArrowDown moves the language selection', activeRow('[data-language]')?.dataset.language ?? null, nextLanguage);
  press('ArrowUp');
  await t.sleep(100);
  check('ArrowUp moves it back', activeRow('[data-language]')?.dataset.language ?? null, 'python');
  press('ArrowDown');
  await t.sleep(100);
  press('Enter');
  await t.sleep(250);
  check(
    'Enter applies the keyboard-selected language',
    await t.raw(),
    `\`\`\`${nextLanguage}\nprint(1)\n\`\`\`\n`
  );

  await t.load('hello world\n');
  await t.click(t.blocks()[0], 0.5, 0.5);
  for (let step = 0; step < 40; step += 1) {
    press('ArrowLeft');
  }
  press('Enter');
  await t.sleep(180);
  for (const key of [':', ':', ':', ' ']) {
    press(key);
    await t.sleep(70);
  }
  await t.sleep(220);
  check(
    'the Div-kind picker starts on Default',
    activeRow('[data-div-kind-choice]')?.getAttribute('data-div-kind-choice') ?? null,
    'default'
  );
  press('ArrowDown');
  await t.sleep(100);
  check(
    'ArrowDown moves the Div-kind selection',
    activeRow('[data-div-kind-choice]')?.getAttribute('data-div-kind-choice') ?? null,
    'callout:note'
  );
  press('Enter');
  await t.sleep(250);
  check(
    'Enter applies the keyboard-selected Div kind',
    await t.raw(),
    '::: {.callout .callout-note}\n\n:::\n\nhello world\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
