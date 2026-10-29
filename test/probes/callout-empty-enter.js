/**
 * Enter on an empty callout's opening line creates one editable body line:
 * GitHub alerts do not get a paragraph separator, and fenced Divs leave the
 * caret in the new body rather than on the closing fence.
 *
 * @covers src/ui/markdown/editing/text_commands.ts,
 *   src/ui/markdown/syntax/callout_body.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const openSource = async () => {
    await t.click(t.prose().querySelector('.markdown-callout-title'));
    await t.sleep(150);
    return t.prose().querySelector('.markdown-callout-source');
  };
  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const github = await openSource();
  await t.click(github, 0.99);
  t.key('Enter');
  await t.sleep(150);
  check(
    'Enter on a GitHub marker creates one body line',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> \n\nAfter\n'
  );

  await t.load('Before\n\n> [!NOTE]\n\nAfter\n');
  const nested = await openSource();
  await t.click(nested, 0.99);
  t.key('Enter');
  await t.sleep(100);
  const caret = caretModule.getCaretRange();
  check(
    'Enter leaves the caret at the end of the new GitHub body line',
    caret
      ? {
          text: caret.startContainer.textContent,
          offset: caret.startOffset
        }
      : null,
    {
      text: '> [!NOTE]\n> ',
      offset: 12
    }
  );
  t.key('>');
  await t.sleep(150);
  check(
    'typing > after that Enter starts one nested quote without another separator',
    await t.raw(),
    'Before\n\n> [!NOTE]\n> >\n\nAfter\n'
  );

  await t.load('Before\n\n::: {.callout .callout-note}\n:::\n\nAfter\n');
  const div = await openSource();
  await t.click(div, 0.99, 0.25);
  t.key('Enter');
  await t.sleep(150);
  t.key('Z');
  await t.sleep(150);
  check(
    'Enter on a Div opening puts the caret in one new body line',
    await t.raw(),
    'Before\n\n::: {.callout .callout-note}\nZ\n:::\n\nAfter\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
