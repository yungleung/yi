/**
 * In-place typing across the list shapes in the default fixture.
 *
 * List items are not all one DOM shape: task items carry chrome, ordered items
 * carry markers, nested items sit inside another list, and captions wrap a list
 * block. Each one must accept the same immediate burst without losing case,
 * characters, caret position, or its mounted block and text node.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/context.ts, src/ui/markdown/editing/typed_text.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const path = `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`;
  const file = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', { path });
  const defaultDocument = new TextDecoder().decode(
    file instanceof ArrayBuffer ? file : Uint8Array.from(file)
  );
  await t.load(defaultDocument);

  const findItem = async (needle) => {
    const choose = () =>
      [...t.prose().querySelectorAll('li')]
        .filter((element) => element.textContent.includes(needle))
        .sort((left, right) => left.textContent.length - right.textContent.length)[0] ?? null;
    const mounted = choose();
    if (mounted) {
      mounted.scrollIntoView({ block: 'center' });
      await t.sleep(120);
      return mounted;
    }
    for (let fraction = 0; fraction <= 1; fraction += 0.1) {
      t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
      await t.sleep(80);
      const item = choose();
      if (item) {
        item.scrollIntoView({ block: 'center' });
        await t.sleep(120);
        return item;
      }
    }
    return null;
  };
  const typeIn = async (needle, typed) => {
    const item = await findItem(needle);
    const node = item
      ? t.textNodesIn(item).find((leaf) => leaf.data.includes(needle.split(' ').at(-1)))
      : null;
    if (!item || !node) {
      return { found: false };
    }
    const at = node.data.indexOf(needle.split(' ').at(-1)) + needle.split(' ').at(-1).length;
    const range = document.createRange();
    range.setStart(node, at);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 1,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);

    const block = item.closest('.markdown-block');
    const before = caret.getCaretRange();
    const text = before?.startContainer.nodeType === Node.TEXT_NODE ? before.startContainer : null;
    if (text === null) {
      return { found: true, caret: false };
    }
    const baseline = text.data;
    let blockSurvived = true;
    let textNodeSurvived = true;
    const prefixes = [];
    const keyTimes = [];
    for (let index = 0; index < typed.length; index += 1) {
      const started = performance.now();
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: typed[index],
          bubbles: true,
          cancelable: true
        })
      );
      keyTimes.push(performance.now() - started);
      blockSurvived &&= block?.isConnected === true;
      const current = caret.getCaretRange();
      textNodeSurvived &&=
        current?.startContainer.nodeType === Node.TEXT_NODE &&
        current.startContainer === text;
      prefixes.push(text.data);
    }
    return {
      found: true,
      caret: true,
      blockSurvived,
      textNodeSurvived,
      prefixes,
      expected: Array.from(
        { length: typed.length },
        (_, index) => `${baseline}${typed.slice(0, index + 1)}`
      ),
      caretOffset: caret.getCaretRange()?.startOffset ?? null,
      expectedCaret: baseline.length + typed.length,
      keyMedian: keyTimes.sort((left, right) => left - right)[Math.floor(keyTimes.length / 2)]
    };
  };

  const cases = [
    ['task item', 'Completed task'],
    ['unordered item', 'Unordered list item'],
    ['ordered item', 'Ordered list item'],
    ['nested item', 'Nested item'],
    ['captioned list item', 'Build the note']
  ];
  for (const [name, needle] of cases) {
    const result = await typeIn(needle, 'Quick_BrownFast');
    check(`${name}: the item is mounted`, result.found, true);
    check(`${name}: the caret stays in its list text`, result.caret, true);
    check(`${name}: the item keeps its block`, result.blockSurvived, true);
    check(`${name}: the item keeps its text node`, result.textNodeSurvived, true);
    check(`${name}: every character and case appears immediately`, result.prefixes, result.expected);
    check(`${name}: the caret finishes the burst`, result.caretOffset, result.expectedCaret);
    check(`${name}: the keystroke path stays fast`, result.keyMedian < 16, true);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
