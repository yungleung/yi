/**
 * Every completion kind accepts its filtered row after typing settles.
 *
 * @covers src/ui/markdown/editing/completions.ts,
 *   src/ui/markdown/syntax/completions.ts
 * @needs-workspace — citation and wikilink entries come from the fixture workspace
 */
(async () => {
  const t = window.__t;
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
      source: (body) => `${target}${body}\n`,
      open: async (preparedLink) => {
        if (preparedLink) {
          await t.click(t.prose().querySelector('.markdown-link'));
        } else {
          await t.click(t.blocks().at(-1), 0.99);
        }
      },
      placeAfter: async (needle) =>
        clickAfter(t.prose().querySelector('.markdown-link-source'), needle)
    },
    {
      name: 'blockquote',
      source: (body) => `${target}> ${body}\n`,
      open: async () => {
        await t.click(t.prose().querySelector('blockquote'), 0.99);
        await t.sleep(120);
      },
      placeAfter: async (needle) =>
        clickAfter(t.prose().querySelector('.markdown-quote-source'), needle)
    },
    {
      name: 'GitHub callout',
      source: (body) => `${target}> [!NOTE]\n> ${body}\n`,
      open: async () => {
        await t.click(t.prose().querySelector('.markdown-callout-title'));
        await t.sleep(120);
      },
      placeAfter: async (needle) =>
        clickAfter(t.prose().querySelector('.markdown-callout-source'), needle)
    },
    {
      name: 'fenced-Div callout',
      source: (body) => `${target}::: {.callout .callout-note}\n${body}\n:::\n`,
      open: async () => {
        await t.click(t.prose().querySelector('.markdown-callout-title'));
        await t.sleep(120);
      },
      placeAfter: async (needle) =>
        clickAfter(t.prose().querySelector('.markdown-callout-source'), needle)
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
      expected: (body) => `${body}[#lst:demo]`
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
      expected: () => 'See. [label](#lst:demo)'
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
      expected: (body, chosen) => `${body}@${chosen}`
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
      expected: (body, chosen) => `${body}[[${chosen}]]`
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
      check(
        `${context.name}: ${kind.name} accepts the filtered row`,
        await t.raw(),
        context.source(kind.expected(kind.body, chosen))
      );
      check(`${context.name}: ${kind.name} closes after accepting`, cardOpen(), false);
    }
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
