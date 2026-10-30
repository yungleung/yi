/**
 * Citation, wikilink, link-fragment and automatic-reference completion remain
 * available while the caret is in a quote, callout or generic Pandoc Div, and
 * accepting a row leaves the container source intact.
 *
 * @covers src/ui/markdown/editing/completions.ts,
 *   src/ui/markdown/syntax/completions.ts
 * @needs-workspace — citations and wikilinks resolve through the fixture workspace
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
  const cardOpen = () =>
    document.querySelector('[data-completion]')?.classList.contains('hidden') === false;
  const rows = () =>
    [...document.querySelectorAll('[data-completion-row]')].map((row) =>
      row.getAttribute('data-completion-row')
    );
  const type = async (key) => {
    t.key(key);
    await t.sleep(150);
  };
  const clickEnd = async (selector, needle) => {
    const root = t.prose().querySelector(selector);
    if (root === null) return false;
    const node = [...t.textNodesIn(root)]
      .reverse()
      .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle);
    if (!node || at < 0) return false;
    const range = document.createRange();
    const end = at + needle.length;
    range.setStart(node, end);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 1,
      clientY: rect.top + 2
    };
    const target = node.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(140);
    return true;
  };
  const acceptFirst = async (rawFor) => {
    const first = rows()[0] ?? null;
    check('the completion list offers a row', first !== null, true);
    await type('Enter');
    check('accepting it keeps the container line', await t.raw(), rawFor(first));
  };

  await t.load(
    '> See \n\n```python {#lst:demo}\nprint(1)\n```\n'
  );
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd('.markdown-quote-source', 'See ');
  await type('[');
  await type('#');
  check('an automatic-reference query opens in a quote', cardOpen(), true);
  check(
    'and offers the document target rather than already-used labels',
    rows().includes('lst:demo'),
    true
  );
  await type('l');
  await acceptFirst(
    (first) => `> See [#${first}]\n\n\`\`\`python {#lst:demo}\nprint(1)\n\`\`\`\n`
  );

  await t.load('> A citation: \n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd('.markdown-quote-source', 'A citation: ');
  await type('@');
  check('a citation query opens in a quote', cardOpen(), true);
  await acceptFirst((first) => `> A citation: @${first}\n`);

  await t.load('> [!NOTE]\n> A citation: \n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(120);
  await clickEnd('.markdown-callout-source', 'A citation: ');
  await type('@');
  check('a citation query opens in a GitHub callout', cardOpen(), true);
  await acceptFirst((first) => `> [!NOTE]\n> A citation: @${first}\n`);

  await t.load('> A link: \n');
  await t.click(t.prose().querySelector('blockquote'), 0.99);
  await clickEnd('.markdown-quote-source', 'A link: ');
  await type('[');
  await type('[');
  check('a wikilink query opens in a quote', cardOpen(), true);
  await acceptFirst((first) => `> A link: [[${first}]]\n`);

  await t.load('> [!NOTE]\n> A link: \n');
  await t.click(t.prose().querySelector('.markdown-callout-title'));
  await t.sleep(120);
  await clickEnd('.markdown-callout-source', 'A link: ');
  await type('[');
  await type('[');
  check('a wikilink query opens in a GitHub callout', cardOpen(), true);
  await acceptFirst((first) => `> [!NOTE]\n> A link: [[${first}]]\n`);

  await t.load(
    '::: {.notes}\nSee \n:::\n\n```python {#lst:generic}\nprint(1)\n```\n'
  );
  await clickEnd('.markdown-fenced-div-source', 'See ');
  await type('[');
  await type('#');
  check('an automatic-reference query opens in a generic Pandoc Div', cardOpen(), true);
  check(
    'and offers the document target',
    rows().includes('lst:generic'),
    true
  );
  await type('g');
  await acceptFirst(
    (first) =>
      `::: {.notes}\nSee [#${first}]\n:::\n\n\`\`\`python {#lst:generic}\nprint(1)\n\`\`\`\n`
  );

  await t.load('::: {.notes}\nA citation: \n:::\n');
  await clickEnd('.markdown-fenced-div-source', 'A citation: ');
  await type('@');
  check('a citation query opens in a generic Pandoc Div', cardOpen(), true);
  await acceptFirst((first) => `::: {.notes}\nA citation: @${first}\n:::\n`);

  await t.load('::: {.notes}\nA link: \n:::\n');
  await clickEnd('.markdown-fenced-div-source', 'A link: ');
  await type('[');
  await type('[');
  check('a wikilink query opens in a generic Pandoc Div', cardOpen(), true);
  await acceptFirst((first) => `::: {.notes}\nA link: [[${first}]]\n:::\n`);

  await t.load(
    '::: {.notes}\nA link: [text]\n:::\n\n```python {#lst:generic}\nprint(1)\n```\n'
  );
  await clickEnd('.markdown-fenced-div-source', 'A link: [text]');
  await type('(');
  await type('#');
  check('a link-fragment query opens in a generic Pandoc Div', cardOpen(), true);
  await acceptFirst(
    (first) =>
      `::: {.notes}\nA link: [text](#${first})\n:::\n\n\`\`\`python {#lst:generic}\nprint(1)\n\`\`\`\n`
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
