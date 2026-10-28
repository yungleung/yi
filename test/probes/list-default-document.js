/**
 * The default fixture demonstrates list numbering, targets, and both link forms.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/references.ts, src/ui/markdown/nodes/caption.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const read = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', {
    path: `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`
  });
  await t.load(
    new TextDecoder().decode(read instanceof ArrayBuffer ? read : Uint8Array.from(read))
  );
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const commandClick = (element) => {
    const box = element.getBoundingClientRect();
    return element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2
      })
    );
  };

  let mounted = false;
  for (let fraction = 0.1; !mounted && fraction <= 1; fraction += 0.1) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(150);
    mounted =
      t.prose().querySelector('[id="list:steps"]') !== null &&
      t.prose().querySelector('[id="list:ordered"]') !== null;
  }
  await t.sleep(250);

  const captions = [...t.prose().querySelectorAll('.markdown-list-block .markdown-caption')].map(
    (caption) => caption.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  );
  check(
    'caption-only, ID-only, and captioned lists use the document label and prefix',
    captions.filter((caption) => caption.startsWith('Procedure 3-')),
    [
      'Procedure 3-1. Preliminary checks',
      'Procedure 3-2.',
      'Procedure 3-3. Release steps'
    ]
  );

  const automatic = t.prose().querySelector('[data-auto-reference="list:steps"]');
  const manual = t.prose().querySelector(
    'a.markdown-link[href="#list:steps"]:not([data-auto-reference])'
  );
  check(
    'automatic and manual references name the same numbered list',
    [automatic?.textContent ?? null, manual?.textContent ?? null],
    ['Procedure 3-3', 'the release steps']
  );

  const target = t.prose().querySelector('[id="list:steps"]');
  const ordered = t.prose().querySelector('[id="list:ordered"]');
  check(
    'explicit list IDs reach the editor DOM',
    [target !== null, ordered !== null],
    [true, true]
  );
  check(
    'template classes are preserved in source but not applied to the editor',
    target?.classList.contains('wide') ?? true,
    false
  );
  check(
    'ordered item starts, task boxes, and nested lists survive',
    [
      ordered?.querySelector('ol')?.getAttribute('start') ?? null,
      target?.querySelectorAll('input[type="checkbox"]').length ?? 0,
      target?.querySelectorAll('li input[type="checkbox"]:checked').length ?? 0,
      target?.querySelectorAll('ul ul > li').length ?? 0
    ],
    ['3', 2, 1, 2]
  );

  const before = location.hash;
  const cancelled = automatic ? commandClick(automatic) : true;
  await t.sleep(300);
  const item = target?.querySelector('li')?.getBoundingClientRect() ?? null;
  const caret = t.caretRect();
  check('command-click is handled by the editor', cancelled, false);
  check('the document hash stays unchanged', location.hash, before);
  check(
    'command-click lands on the list’s first item',
    item !== null &&
      caret !== null &&
      caret.x >= item.left - 4 &&
      caret.x <= item.right + 4 &&
      caret.y >= item.top - 4 &&
      caret.y <= item.bottom + 4,
    true
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
