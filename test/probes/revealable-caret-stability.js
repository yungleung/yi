/**
 * Inline revealable nodes keep the caret at the character just typed after the deferred
 * parse check rebuilds their block.
 *
 * Example: typing the closing `**` of `**word**` is a plain-text edit while the paragraph is
 * still plain text; 200 ms later the paragraph renders as strong source. The caret must
 * remain at the closing marker rather than jumping to the start of the rebuilt node.
 *
 * @covers src/ui/markdown/editing/edit_verification.ts,
 *   src/ui/markdown/markdown_editor.ts,
 *   src/ui/markdown/editor/view_state.ts,
 *   src/ui/markdown/caret/caret.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const geometry = await t.app('/src/ui/markdown/caret/geometry.ts');
  const checks = [];
  const check = (name, actual, expected = true) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  const clickAfter = async (needle) => {
    const node = t.blocks()
      .flatMap((block) => t.textNodesIn(block))
      .reverse()
      .find((candidate) => candidate.data.includes(needle));
    const root = node?.parentElement?.closest('.markdown-block') ?? null;
    const at = node?.data.lastIndexOf(needle) ?? -1;
    if (!node || !root || at < 0) {
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
    node.parentElement.dispatchEvent(new PointerEvent('pointerdown', event));
    node.parentElement.dispatchEvent(new PointerEvent('pointerup', event));
    node.parentElement.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(120);
    return caretModule.getCaretRange() !== null;
  };

  /** Whether `range` is the logical end of `element`, across its highlighted spans. */
  const atEndOf = (range, element) => {
    if (range === null || element === null || !element.contains(range.startContainer)) {
      return false;
    }
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(element, element.childNodes.length);
    return tail.toString() === '';
  };

  const caretShape = (sourceSelector) => {
    const range = caretModule.getCaretRange();
    if (range === null || !range.startContainer.isConnected) {
      return null;
    }
    const source = t.prose().querySelector(sourceSelector);
    const block = range.startContainer.parentElement?.closest('.markdown-block') ?? null;
    const expected = geometry.caretRect(range);
    const box = document.querySelector('.markdown-caret')?.getBoundingClientRect() ?? null;
    const element =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    const text = range.startContainer.textContent ?? '';
    return {
      className: element?.className ?? '',
      blockText: block?.textContent ?? null,
      inSource: atEndOf(range, source),
      prefix:
        range.startContainer.nodeType === Node.TEXT_NODE
          ? text.slice(0, range.startOffset)
          : null,
      text,
      offset: range.startOffset,
      atTextEnd: range.startOffset === text.length,
      sourceText: source?.textContent ?? null,
      drawnMatches:
        expected !== null &&
        box !== null &&
        Math.abs(expected.left - box.left) <= 1.5 &&
        Math.abs(expected.top - box.top) <= 1.5
    };
  };

  const cases = [
    {
      name: 'strong',
      initial: 'Before **word after\n',
      anchor: 'Before **word',
      typed: '**',
      source: '.markdown-strong-source',
      sourceText: '**word**'
    },
    {
      name: 'inline math',
      initial: 'Before $x + y after\n',
      anchor: 'Before $x + y',
      typed: '$',
      source: '.markdown-math-source',
      sourceText: '$x + y$'
    },
    {
      name: 'link',
      initial: 'Before [label](url after\n',
      anchor: 'Before [label](url',
      typed: ')',
      source: '.markdown-link-source',
      sourceText: '[label](url)'
    },
    {
      name: 'citation',
      initial: 'Before @ after\n',
      anchor: 'Before @',
      typed: 'smith2020',
      source: '.markdown-citation-source',
      sourceText: '@smith2020'
    },
    {
      name: 'wikilink',
      initial: 'Before [[Target after\n',
      anchor: 'Before [[Target',
      typed: ']]',
      source: '.markdown-wikilink-source',
      sourceText: '[[Target]]'
    },
    {
      name: 'automatic reference',
      initial: 'Before [#target after\n',
      anchor: 'Before [#target',
      typed: ']',
      source: '.markdown-auto-reference-source',
      sourceText: '[#target]'
    }
  ];

  for (const entry of cases) {
    await t.load(`# Target\n\n${entry.initial}`);
    check(
      `${entry.name}: the caret starts at the insertion point`,
      await clickAfter(entry.anchor)
    );
    for (const key of entry.typed) {
      document.execCommand('insertText', false, key);
      await t.sleep(18);
    }
    await t.sleep(320);
    const settled = caretShape(entry.source);
    const source = t.prose().querySelector(entry.source);
    check(
      `${entry.name}: the typed source exists after the deferred rebuild`,
      source !== null || { settled }
    );
    check(
      `${entry.name}: the source contains the completed construct`,
      source?.textContent === entry.sourceText ||
        { actual: source?.textContent ?? null, expected: entry.sourceText }
    );
    check(
      `${entry.name}: the caret remains at the source's closing edge`,
      settled !== null &&
        settled.inSource || { settled }
    );
    check(
      `${entry.name}: the drawn caret follows the logical caret`,
      (settled?.inSource === true && settled.drawnMatches) || { settled }
    );
  }

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
