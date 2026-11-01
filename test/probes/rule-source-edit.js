/**
 * A rule written `* * *`: its source view and the caret inside it are the text
 * the author wrote, not remark's canonical `***`.
 *
 * The two are the same length only when the rule is written `---` or `___`, so
 * this is the case where a source view built from the serializer puts the caret
 * two characters early — in the middle of the author's marker.
 *
 * @covers src/ui/markdown/nodes/revealable_node.ts, src/ui/markdown/source_mode/
 */
(async () => {
  const t = window.__t;
  await t.load('above\n\n* * *\n\nbelow\n');
  const rule = t.blocks().find((block) => block.querySelector('hr'));
  await t.click(rule.querySelector('.markdown-node'), 0.5);
  const shown = t.prose().querySelector('.markdown-source-view')?.textContent ?? null;
  t.report({ shown });
  t.key('x');
  await t.sleep(250);
  const raw = await t.raw();
  const checks = [
    { name: 'the source view shows what the author wrote', actual: shown, expected: '* * *' },
    {
      name: 'typing lands at the end of the rule, not inside it',
      actual: raw,
      expected: 'above\n\n* * *x\n\nbelow\n'
    }
  ];
  return { checks, failed: checks.filter((check) => check.actual !== check.expected).map((check) => check.name) };
})()
