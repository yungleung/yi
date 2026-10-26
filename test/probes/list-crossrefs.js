/**
 * Captioned lists are reference targets and navigation enters their first item.
 *
 * @covers src/ui/markdown/document/reference_index.ts,
 *   src/ui/markdown/markdown_editor.ts, src/ui/markdown/editing/references.ts
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
  const commandClick = (anchor) => {
    const box = anchor.getBoundingClientRect();
    return anchor.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
  };

  await t.load(
    '---\n' +
      'reference-labels:\n' +
      '  list: Procedure\n' +
      'reference-number-prefixes:\n' +
      '  list: "2-"\n' +
      '---\n\n' +
      'See [#list:steps] and [the empty list](#list:empty).\n\n' +
      '- First item\n' +
      '- Second item\n\n' +
      ': Steps {#list:steps}\n\n' +
      '- \n\n' +
      ': {#list:empty}\n'
  );
  check(
    'automatic list references use the configured label and prefix',
    t.prose().querySelector('a[href="#list:steps"]')?.textContent ?? null,
    'Procedure 2-1'
  );
  check(
    'a caption-only list still advances the list sequence',
    t.prose().querySelector('#list\\:empty .markdown-list-number')?.textContent ?? null,
    'Procedure 2-2.'
  );

  const automatic = t.prose().querySelector('a[href="#list:steps"]');
  if (automatic) {
    commandClick(automatic);
    await t.sleep(350);
  }
  check(
    'command-click reveals the list',
    document.querySelector('.markdown-list-block')?.id ?? null,
    'list:steps'
  );
  check(
    'the caret lands at the first item content',
    (() => {
      const item = t.prose().querySelector('#list\\:steps li');
      const box = item?.getBoundingClientRect() ?? null;
      const caret = t.caretRect();
      return {
        firstItem: item?.textContent?.trim() ?? null,
        within:
          box !== null &&
          caret !== null &&
          caret.x >= box.left - 4 &&
          caret.x <= box.right + 4 &&
          caret.y >= box.top - 4 &&
          caret.y <= box.bottom + 4
      };
    })(),
    { firstItem: 'First item', within: true }
  );

  await t.load(
    'See [the empty list](#list:empty).\n\n' +
      '- ' +
      '\n\n' +
      ': {#list:empty}\n'
  );
  const empty = t.prose().querySelector('a[href="#list:empty"]');
  if (empty) {
    commandClick(empty);
    await t.sleep(350);
  }
  check(
    'an empty first item keeps a navigation placeholder',
    t.prose().querySelector('#list\\:empty .markdown-list-placeholder') !== null,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
