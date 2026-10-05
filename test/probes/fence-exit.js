/**
 * Leaving a fenced block by its own lines.
 *
 * While the caret is inside one, the closing fence is a line like any other (`nodes/fence_text.ts`),
 * so `Enter` at its end makes a blank line under the block and the caret goes there — for all three
 * fenced kinds. A character typed at the body's own end still belongs to the body
 * (`syntax/fence_edits.ts`), whichever side of its last blank line the click landed on.
 *
 * @covers src/ui/markdown/editing/text_commands.ts, src/ui/markdown/nodes/fence_text.ts,
 *   src/ui/markdown/syntax/fence_edits.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const caretText = () => caretModule.getCaretRange()?.startContainer.textContent ?? null;

  const cases = [
    {
      name: 'a fenced code block',
      doc: 'text\n\n```ts\nlet a = 1;\n```\n\ntail\n',
      enter: () => t.prose().querySelector('.markdown-fenced-code'),
      fence: '```',
      out: 'text\n\n```ts\nlet a = 1;\n```\n\nN\n\ntail\n'
    },
    {
      name: 'the frontmatter',
      doc: '---\nid: 1\n---\n\ntail\n',
      enter: () => t.prose().querySelector('.markdown-frontmatter'),
      fence: '---',
      out: '---\nid: 1\n---\n\nN\n\ntail\n'
    },
    {
      name: 'a display formula',
      doc: '$$\n\\frac{a}{b}\n$$\n\ntail\n',
      enter: () => t.prose().querySelector('[data-display="true"]'),
      fence: '$$',
      out: '$$\n\\frac{a}{b}\n$$\n\nN\n\ntail\n'
    }
  ];

  for (const entry of cases) {
    await t.load(entry.doc);
    await t.sleep(200);
    await t.click(entry.enter(), 0.5, 0.5);
    await t.sleep(250);
    t.key('ArrowDown');
    await t.sleep(200);
    check(`${entry.name}: its closing fence is a line the caret can sit on`, caretText(), entry.fence);
    t.key('End');
    await t.sleep(150);
    t.key('Enter');
    await t.sleep(300);
    t.key('N');
    await t.sleep(300);
    check(`${entry.name}: Enter at the fence's end leaves a line under the block`, await t.raw(), entry.out);
  }

  // The body's own end keeps a character in the body, whichever side of the last blank line the
  // click landed on (the rule `syntax/fence_edits.ts: fenceTypedWrite` states).
  await t.load('text\n\n```ts\nlet a = 1;\n\n```\n\ntail\n');
  await t.sleep(200);
  await t.click(t.prose().querySelector('.markdown-fenced-code'), 0.99, 0.99);
  await t.sleep(250);
  t.key('W');
  await t.sleep(300);
  check(
    'a click at the body’s own end still types in the body',
    await t.raw(),
    'text\n\n```ts\nlet a = 1;\nW\n```\n\ntail\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
