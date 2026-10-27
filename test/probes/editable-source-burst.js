/**
 * Every revealed source is one editable text surface.
 *
 * It must not matter which node type opened the source or which Markdown marker
 * the author is typing: the source box stays mounted, keeps the keyboard, and
 * receives every character. The cases cover the two source tags and the syntax
 * characters that rendered prose correctly leaves to the ordinary parser.
 *
 * @covers src/ui/markdown/source_text.ts,
 *   src/ui/markdown/editing/typed_text.ts,
 *   src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/text_commands.ts,
 *   src/ui/markdown/syntax/plain_edit.ts
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
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const press = (key) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );

  const burst = async ({
    name,
    documentText,
    clickSelector,
    sourceSelector,
    sourceClickSelector = null,
    before = [],
    typed,
    expected
  }) => {
    await t.load(documentText);
    const target = t.prose().querySelector(clickSelector);
    if (!target) {
      check(`${name}: the rendered node is mounted`, null, clickSelector);
      return;
    }
    await t.click(target, 0.72, 0.5);
    await sleep(300);
    if (sourceClickSelector !== null) {
      await t.click(t.prose().querySelector(sourceClickSelector), 0.99, 0.5);
      await sleep(150);
    }

    const source = t.prose().querySelector(sourceSelector);
    const block = source?.closest('.markdown-block') ?? null;
    for (const key of before) {
      press(key);
      await sleep(0);
    }
    const seam = document.querySelector('.markdown-composition-input');
    let focusLosses = 0;
    let sourceStayedThroughBurst = true;
    let blockStayedThroughBurst = true;
    const countFocusLoss = (event) => {
      if (event.target === seam) {
        focusLosses += 1;
      }
    };
    document.addEventListener('focusout', countFocusLoss, true);
    for (const character of typed) {
      press(character);
      await sleep(0);
      sourceStayedThroughBurst &&= t.prose().querySelector(sourceSelector) === source;
      blockStayedThroughBurst &&=
        (t.prose().querySelector(sourceSelector)?.closest('.markdown-block') ?? null) === block;
    }
    await sleep(300);
    document.removeEventListener('focusout', countFocusLoss, true);

    const currentSource = t.prose().querySelector(sourceSelector);
    check(`${name}: the source is open`, source !== null, true);
    check(`${name}: the source box survives the burst`, sourceStayedThroughBurst, true);
    check(`${name}: the block survives the burst`, blockStayedThroughBurst, true);
    check(`${name}: the input seam keeps focus`, focusLosses, 0);
    check(`${name}: the source remains open after settling`, currentSource !== null, true);
    check(`${name}: every character reaches the document`, await t.raw(), expected);
  };

  await burst({
    name: 'link',
    documentText: 'Before [title](https://example.com) after\n',
    clickSelector: 'a.markdown-link',
    sourceSelector: '.markdown-link-source',
    typed: '[_link',
    expected: 'Before [title[_link](https://example.com) after\n'
  });

  await burst({
    name: 'automatic reference',
    documentText: '# Target\n\nSee [#target].\n',
    clickSelector: 'a[data-auto-reference]',
    sourceSelector: '.markdown-auto-reference-source',
    typed: '_part',
    expected: '# Target\n\nSee [#target_part].\n'
  });

  await burst({
    name: 'inline math',
    documentText: 'Before $x + y$ after\n',
    clickSelector: '[data-math]',
    sourceSelector: '.markdown-math-source',
    typed: '^2',
    expected: 'Before $x + y^2$ after\n'
  });

  await burst({
    name: 'table caption',
    documentText: '| A |\n| --- |\n| 1 |\n\n: Result {#tbl:x}\n',
    clickSelector: '.markdown-caption-number, .markdown-caption',
    sourceSelector: '.markdown-caption-source',
    before: ['ArrowLeft'],
    typed: ' x=12',
    expected: '| A |\n| --- |\n| 1 |\n\n: Result {#tbl:x x=12}\n'
  });

  await burst({
    name: 'fenced-code attributes',
    documentText: '```js {#sample}\nconst value = 1;\n```\n',
    clickSelector: '.markdown-fenced-code',
    sourceSelector: '.markdown-source-text',
    sourceClickSelector: '.markdown-fence-delimiter',
    before: ['ArrowLeft'],
    typed: ' .wide',
    expected: '```js {#sample .wide}\nconst value = 1;\n```\n'
  });

  await burst({
    name: 'strong',
    documentText: '**word** tail\n',
    clickSelector: 'strong',
    sourceSelector: '.markdown-strong-source',
    typed: '_x',
    expected: '**word_x** tail\n'
  });

  await burst({
    name: 'emphasis',
    documentText: '*word* tail\n',
    clickSelector: 'em',
    sourceSelector: '.markdown-emphasis-source',
    typed: '_x',
    expected: '*word_x* tail\n'
  });

  await burst({
    name: 'strikethrough',
    documentText: '~~word~~ tail\n',
    clickSelector: 'del',
    sourceSelector: '.markdown-delete-source',
    typed: '_x',
    expected: '~~word_x~~ tail\n'
  });

  await burst({
    name: 'inline code',
    documentText: '`word` tail\n',
    clickSelector: 'code',
    sourceSelector: '.markdown-inline-code-source',
    typed: '_x',
    expected: '`word_x` tail\n'
  });

  await burst({
    name: 'wikilink',
    documentText: '[[Target]] tail\n',
    clickSelector: '.markdown-wikilink',
    sourceSelector: '.markdown-wikilink-source',
    typed: '#part',
    expected: '[[Target#part]] tail\n'
  });

  await burst({
    name: 'citation',
    documentText: 'see [@key] here\n',
    clickSelector: '.markdown-citation',
    sourceSelector: '.markdown-citation-source',
    typed: ':part',
    expected: 'see [@key:part] here\n'
  });

  await burst({
    name: 'image',
    documentText: '![alt](https://example.com/x.png) tail\n',
    clickSelector: 'img',
    sourceSelector: '.markdown-image-source',
    typed: '_x',
    expected: '![alt_x](https://example.com/x.png) tail\n'
  });

  await burst({
    name: 'footnote reference',
    documentText:
      'Body[^note] here.\n\n[^note]: The note.\n\n[^note_x]: The renamed note.\n',
    clickSelector: '[data-footnote-ref]',
    sourceSelector: '.markdown-footnote-source',
    typed: '_x',
    expected:
      'Body[^note_x] here.\n\n[^note]: The note.\n\n[^note_x]: The renamed note.\n'
  });

  await burst({
    name: 'heading attributes',
    documentText: '# Heading {#custom .wide}\n',
    clickSelector: '.markdown-heading',
    sourceSelector: '.markdown-heading-attributes-source',
    sourceClickSelector: '.markdown-heading-attributes-source',
    before: ['ArrowLeft'],
    typed: ' owner=demo',
    expected: '# Heading {#custom .wide owner=demo}\n'
  });

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
