/**
 * A revealable inline node closes its source once typing moves beyond its right edge.
 *
 * The caret at the node's closing marker is still the node's edge, so its source stays open.
 * The next character belongs to the surrounding prose: it is written after the complete
 * node and the node must render again. This holds for every inline revealable family whose
 * source replaces a rendering rather than an editable text run.
 *
 * @covers src/ui/markdown/source_mode/,
 *   src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/typed_text.ts
 * @needs-workspace — citations and wikilinks resolve through the fixture workspace
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
    const texts = source === null ? [] : t.textNodesIn(source);
    const last = texts.at(-1);
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
      name: 'link',
      document: 'Before [title](https://example.com) after\n',
      rendered: 'a.markdown-link',
      source: '.markdown-link-source',
      expected: 'Before [title](https://example.com)X after\n'
    },
    {
      name: 'automatic reference',
      document: '# Target\n\nSee [#target].\n',
      rendered: 'a[data-auto-reference]',
      source: '.markdown-auto-reference-source',
      expected: '# Target\n\nSee [#target]X.\n'
    },
    {
      name: 'citation',
      document: 'See [@key] here.\n',
      rendered: '.markdown-citation',
      source: '.markdown-citation-source',
      expected: 'See [@key]X here.\n'
    },
    {
      name: 'narrative citation extension',
      document: 'See @smith2020 here.\n',
      rendered: '.markdown-citation',
      source: '.markdown-citation-source',
      expected: 'See @smith2020X here.\n',
      after: { source: true, rendered: false }
    },
    {
      name: 'wikilink',
      document: 'See [[Target]] here.\n',
      rendered: '.markdown-wikilink',
      source: '.markdown-wikilink-source',
      expected: 'See [[Target]]X here.\n'
    },
    {
      name: 'inline math',
      document: 'Before $x + y$ after.\n',
      rendered: '[data-math]',
      source: '.markdown-math-source',
      expected: 'Before $x + y$X after.\n'
    },
    {
      name: 'image',
      document: '![alt](https://example.com/x.png) after.\n',
      rendered: 'img',
      source: '.markdown-image-source',
      expected: '![alt](https://example.com/x.png)X after.\n'
    },
    {
      name: 'footnote reference',
      document: 'Body[^note].\n\n[^note]: The note.\n',
      rendered: '[data-footnote-ref]',
      source: '.markdown-footnote-source',
      expected: 'Body[^note]X.\n\n[^note]: The note.\n'
    },
    {
      name: 'hard break',
      document: 'Before\\\nAfter.\n',
      rendered: 'br',
      source: '.markdown-break-source',
      expected: 'Before\\\nXAfter.\n'
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
      `${entry.name}: source stays open at its right edge`,
      {
        source: t.prose().querySelector(entry.source) !== null,
        placed: await placeAtSourceEnd(entry.source)
      },
      {
        source: true,
        placed: true
      }
    );

    t.key('X');
    await t.sleep(260);
    check(
      `${entry.name}: the character is written beyond the node`,
      await t.raw(),
      entry.expected
    );
    check(
      `${entry.name}: the source settles from the text around the caret`,
      {
        source: t.prose().querySelector(entry.source) !== null,
        rendered: t.prose().querySelector(entry.rendered) !== null
      },
      entry.after ?? { source: false, rendered: true }
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
