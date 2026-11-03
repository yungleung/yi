/**
 * Revealable block sources keep both the editing offset and the drawn caret after writing.
 *
 * Example: typing `X` after the last code character must leave the caret after `X` in
 * the code source, not at the start of the source or on the following paragraph.
 *
 * @covers src/ui/markdown/editing/edit_verification.ts,
 *   src/ui/markdown/markdown_editor.ts,
 *   src/ui/markdown/editor/view_state.ts,
 *   src/ui/markdown/caret/span.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const geometry = await t.app('/src/ui/markdown/caret/geometry.ts');
  const offsets = await t.app('/src/ui/markdown/caret/offsets.ts');
  const checks = [];
  const check = (name, actual, expected = true) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  const clickAfter = async (root, needle) => {
    const node = [...t.textNodesIn(root)]
      .reverse()
      .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle) ?? -1;
    if (!node || at < 0) {
      return false;
    }
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
    return caretModule.getCaretRange() !== null;
  };

  const sourceFor = (selector, expected) =>
    [...t.prose().querySelectorAll(selector)].find(
      (element) => (element.textContent ?? '').includes(expected)
    ) ?? null;

  const shape = (sourceSelector, expected) => {
    const range = caretModule.getCaretRange();
    const source = sourceFor(sourceSelector, expected);
    const expectedRect = range === null ? null : geometry.caretRect(range);
    const box = document.querySelector('.markdown-caret')?.getBoundingClientRect() ?? null;
    const node = range?.startContainer ?? null;
    const within =
      range !== null && source !== null
        ? offsets.sourceTextOffset(source, range.startContainer, range.startOffset)
        : null;
    const expectedWithin =
      source === null ? null : source.textContent.indexOf(expected) + expected.length;
    return {
      exists: range !== null && node !== null && node.isConnected,
      text: node?.textContent ?? null,
      offset: range?.startOffset ?? null,
      inSource:
        range !== null &&
        source !== null &&
        source.contains(range.startContainer),
      within,
      expectedWithin,
      atTypedCharactersEnd:
        within !== null &&
        expectedWithin !== null &&
        within === expectedWithin,
      expected: expectedRect,
      drawn: box
        ? {
            left: box.left,
            top: box.top,
            height: box.height
          }
        : null,
      drawnMatches:
        expectedRect !== null &&
        box !== null &&
        Math.abs(expectedRect.left - box.left) <= 1.5 &&
        Math.abs(expectedRect.top - box.top) <= 1.5
    };
  };

  const cases = [
    {
      name: 'fenced code',
      document: '```js\nconst value = 1;\n```\n\nAfter.\n',
      block: 0,
      anchor: ';',
      expected: 'const value = 1;X',
      source: 'pre.markdown-source-text'
    },
    {
      name: 'display math',
      document: '$$\nx = 1\n$$\n\nAfter.\n',
      block: 0,
      anchor: '1',
      expected: 'x = 1X',
      source: 'pre.markdown-source-text'
    },
    {
      name: 'frontmatter',
      document: '---\ntitle: A note\n---\n\nAfter.\n',
      block: 0,
      anchor: 'note',
      expected: 'title: A noteX',
      source: 'pre.markdown-source-text'
    },
    {
      name: 'quote source',
      document: '> A quoted line\n\nAfter.\n',
      block: 0,
      anchor: 'line',
      expected: 'A quoted lineX',
      source: 'pre.markdown-source-text'
    },
    {
      name: 'fenced Div source',
      document: '::: {.columns}\nLeft\n:::\n\nAfter.\n',
      block: 0,
      anchor: 'Left',
      expected: 'LeftX',
      source: 'pre.markdown-source-text'
    }
  ];

  for (const entry of cases) {
    await t.load(entry.document);
    const block = t.blocks()[entry.block];
    check(
      `${entry.name}: clicking the rendering places the caret`,
      await clickAfter(block, entry.anchor)
    );
    await t.sleep(120);
    const source = t.blocks()[entry.block]?.querySelector('pre.markdown-source-text') ?? null;
    check(`${entry.name}: the source view opened`, source !== null);
    t.key('X');
    const samples = [];
    for (let elapsed = 240; elapsed <= 360; elapsed += 20) {
      await t.sleep(20);
      samples.push({ elapsed, ...shape(entry.source, entry.expected) });
    }
    const immediate = samples[0];
    const settled = samples.at(-1);
    const raw = await t.raw();
    check(
      `${entry.name}: the typed character remains in the document`,
      raw.includes(entry.expected) || { raw, expected: entry.expected }
    );
    check(
      `${entry.name}: the editing position remains in the source`,
      samples.every((sample) => sample.exists && sample.inSource) ||
        { immediate, settled, samples }
    );
    check(
      `${entry.name}: the editing position remains after the typed character`,
      samples.every((sample) => sample.atTypedCharactersEnd) ||
        { immediate, settled, samples }
    );
    check(
      `${entry.name}: the drawn caret follows the editing position`,
      settled.drawnMatches || { immediate, settled, samples }
    );
  }

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
