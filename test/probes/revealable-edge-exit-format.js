/**
 * Inline formatting runs render as soon as typing moves beyond their closing marker.
 *
 * These nodes use the same source-mode contract as links and citations, but their content
 * remains ordinary editable text. A caret at the closing marker keeps the markdown visible;
 * one character after it belongs to the surrounding prose and closes that source.
 *
 * @covers src/ui/markdown/source_mode/,
 *   src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/typed_text.ts
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

  const placeAtSourceEnd = async (selector) => {
    const source = t.prose().querySelector(selector);
    const last = source === null ? undefined : t.textNodesIn(source).at(-1);
    if (!last) {
      return false;
    }
    const range = document.createRange();
    range.setStart(last, last.data.length);
    range.collapse(true);
    caretModule.setCaretRange(range);
    await t.sleep(80);
    return true;
  };

  const cases = [
    {
      name: 'strong',
      document: '**word** after.\n',
      rendered: 'strong',
      source: '.markdown-strong-source',
      expected: '**word**X after.\n'
    },
    {
      name: 'emphasis',
      document: '*word* after.\n',
      rendered: 'em',
      source: '.markdown-emphasis-source',
      expected: '*word*X after.\n'
    },
    {
      name: 'strikethrough',
      document: '~~word~~ after.\n',
      rendered: 'del',
      source: '.markdown-delete-source',
      expected: '~~word~~X after.\n'
    },
    {
      name: 'inline code',
      document: '`word` after.\n',
      rendered: 'code',
      source: '.markdown-inline-code-source',
      expected: '`word`X after.\n'
    }
  ];

  for (const entry of cases) {
    await t.load(entry.document);
    const rendered = t.prose().querySelector(entry.rendered);
    if (!rendered) {
      check(`${entry.name}: rendered node is mounted`, null, entry.rendered);
      continue;
    }
    await t.click(rendered, 0.5);
    await t.sleep(160);
    check(
      `${entry.name}: source is open at the closing marker`,
      {
        source: t.prose().querySelector(entry.source) !== null,
        placed: await placeAtSourceEnd(entry.source)
      },
      { source: true, placed: true }
    );

    t.key('X');
    await t.sleep(260);
    check(`${entry.name}: the character is written beyond the run`, await t.raw(), entry.expected);
    check(
      `${entry.name}: the run renders once the caret is beyond it`,
      {
        source: t.prose().querySelector(entry.source) !== null,
        rendered: t.prose().querySelector(entry.rendered) !== null
      },
      { source: false, rendered: true }
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
