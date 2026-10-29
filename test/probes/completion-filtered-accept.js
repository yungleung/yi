/**
 * Every completion kind accepts its filtered row after typing settles. Acceptance leaves the
 * caret at the new node's closing edge; the following character decides from the rebuilt
 * paragraph whether the node ends there and renders or continues its editable source.
 *
 * @covers src/ui/markdown/editing/completions.ts,
 *   src/ui/markdown/syntax/completions.ts
 * @needs-workspace — citation and wikilink entries come from the fixture workspace
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected = true) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const rows = () =>
    [...document.querySelectorAll('[data-completion-row]')].map((row) =>
      row.getAttribute('data-completion-row')
    );
  const cardOpen = () =>
    document.querySelector('[data-completion]')?.classList.contains('hidden') === false;
  const type = async (keys, settle = 35) => {
    for (const key of keys) {
      t.key(key);
      await t.sleep(settle);
    }
    // Past the deferred parse check: a list that remains visible after its
    // block rebuilds must still own Enter.
    await t.sleep(240);
  };
  const clickAfter = async (root, needle) => {
    const node = root === null
      ? null
      : [...t.textNodesIn(root)]
          .reverse()
          .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle) ?? -1;
    if (!node || at < 0) return false;
    const range = document.createRange();
    range.setStart(node, at + needle.length);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.left + 1,
      clientY: box.top + box.height / 2
    };
    const target = node.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(120);
    return true;
  };
  const target = '```python {#lst:demo}\nprint(1)\n```\n\n';
  const contexts = [
    {
      name: 'ordinary text',
      expectsRendered: true,
      source: (body) => `${target}${body} tail\n`,
      open: async (preparedLink) => {
        if (preparedLink) {
          await t.click(t.prose().querySelector('.markdown-link'));
        } else {
          await t.click(t.blocks().at(-1), 0.99);
        }
      },
      placeAfter: async (needle) =>
        clickAfter(
          t.prose().querySelector('.markdown-link-source') ?? t.blocks().at(-1),
          needle
        )
    }
  ];

  const cases = [
    {
      name: 'automatic reference',
      body: 'See.',
      preparedLink: false,
      open: async (context) => {
        await context.placeAfter('See.');
        await type(['[', '#']);
      },
      query: async () => {
        await type(['l', 's']);
        return 'lst:demo';
      },
      expected: (body) => `${body}[#lst:demo]`,
      rendered: 'a.markdown-link[data-auto-reference]',
      source: '.markdown-auto-reference-source'
    },
    {
      name: 'link fragment',
      body: 'See. [label]()',
      preparedLink: true,
      open: async (context) => {
        await context.placeAfter('(');
        await type(['#']);
      },
      query: async () => {
        await type(['l', 's']);
        return 'lst:demo';
      },
      expected: () => 'See. [label](#lst:demo)',
      rendered: 'a.markdown-link',
      source: '.markdown-link-source'
    },
    {
      name: 'citation',
      body: 'See.',
      preparedLink: false,
      open: async (context) => {
        await context.placeAfter('See.');
        await type(['@']);
      },
      query: async () => {
        const chosen = rows()[0] ?? '';
        await type([...chosen.slice(0, 2)]);
        return chosen;
      },
      expected: (body, chosen) => `${body}@${chosen}`,
      rendered: '.markdown-citation',
      source: '.markdown-citation-source',
      // A narrative citation has no closing bracket: a space, not a key
      // character, is what ends it before the surrounding prose.
      beyond: ' '
    },
    {
      name: 'wikilink',
      body: 'See.',
      preparedLink: false,
      open: async (context) => {
        await context.placeAfter('See.');
        await type(['[', '[']);
      },
      query: async () => {
        const chosen = rows()[0] ?? '';
        await type([...chosen.slice(0, 2)]);
        return chosen;
      },
      expected: (body, chosen) => `${body}[[${chosen}]]`,
      rendered: '.markdown-wikilink',
      source: '.markdown-wikilink-source'
    }
  ];

  for (const context of contexts) {
    for (const kind of cases) {
      await t.load(context.source(kind.body));
      await context.open(kind.preparedLink);
      await kind.open(context);
      check(`${context.name}: ${kind.name} opens`, cardOpen() && rows().length > 0);
      const chosen = await kind.query();
      check(
        `${context.name}: ${kind.name} keeps the filtered row in hand`,
        cardOpen() && rows().includes(chosen)
      );
      await type(['Enter'], 0);
      const accepted = context.source(kind.expected(kind.body, chosen));
      const range = caretModule.getCaretRange();
      const edgeSource =
        range === null ? null : t.prose().querySelector(kind.source);
      check(
        `${context.name}: ${kind.name} leaves the caret at the closing edge`,
        range !== null &&
          edgeSource !== null &&
          edgeSource.contains(range.startContainer) &&
          range.startOffset === (range.startContainer.textContent ?? '').length
      );
      if (context.expectsRendered) {
        check(
          `${context.name}: ${kind.name} stays in source at its closing edge`,
          t.prose().querySelector(kind.source) !== null,
          true
        );
        const beyond = kind.beyond ?? 'X';
        t.key(beyond);
        await t.sleep(260);
        check(
          `${context.name}: ${kind.name} starts the surrounding text beyond the node`,
          await t.raw(),
          accepted.replace(' tail\n', `${beyond} tail\n`)
        );
        check(
          `${context.name}: ${kind.name} renders once the caret is beyond its edge`,
          t.prose().querySelector(kind.rendered) !== null &&
            t.prose().querySelector(kind.source) === null
        );
      } else {
        check(`${context.name}: ${kind.name} accepts the filtered row`, await t.raw(), accepted);
      }
      check(`${context.name}: ${kind.name} closes after accepting`, cardOpen(), false);
    }
  }

  for (const kind of cases) {
    await t.load(`${target}${kind.body}\n`);
    await contexts[0].open(kind.preparedLink);
    await kind.open(contexts[0]);
    const chosen = await kind.query();
    await type(['Enter'], 0);
    check(
      `end of line: ${kind.name} stays in source at its closing edge`,
      t.prose().querySelector(kind.source) !== null,
      true
    );
    const beyond = kind.beyond ?? 'X';
    t.key(beyond);
    await t.sleep(260);
    check(
      `end of line: ${kind.name} starts the surrounding text beyond the node`,
      await t.raw(),
      `${target}${kind.expected(kind.body, chosen)}${beyond}\n`
    );
    check(
      `end of line: ${kind.name} renders once the caret is beyond its edge`,
      t.prose().querySelector(kind.rendered) !== null &&
        t.prose().querySelector(kind.source) === null
    );
  }

  await t.load(`${target}See [@] tail\n`);
  await clickAfter(t.blocks().at(-1), '[@');
  await type(['s', 'm']);
  await type(['Enter'], 0);
  check(
    'a parenthetical citation stays in source at its closing bracket',
    t.prose().querySelector('.markdown-citation-source') !== null,
    true
  );
  t.key('X');
  await t.sleep(260);
  check(
    'typing beyond a parenthetical citation starts the surrounding text',
    await t.raw(),
    `${target}See [@smith2020]X tail\n`
  );
  check(
    'and the citation renders once the caret is beyond that bracket',
    t.prose().querySelector('.markdown-citation') !== null &&
      t.prose().querySelector('.markdown-citation-source') === null
  );

  await t.load('Before [test] tail\n');
  await clickAfter(t.blocks().at(-1), ']');
  await type(['(']);
  const pairRange = caretModule.getCaretRange();
  check('typing a link destination opener pairs it', await t.raw(), 'Before [test]() tail\n');
  check(
    'typing a link destination opener keeps its caret inside the pair',
    pairRange === null
      ? null
      : {
          text: pairRange.startContainer.textContent,
          offset: pairRange.startOffset
        },
    { text: '[test]()', offset: 7 }
  );
  check(
    'and the link remains in source mode',
    t.prose().querySelector('.markdown-link-source') !== null &&
      t.prose().querySelector('a.markdown-link') === null,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
