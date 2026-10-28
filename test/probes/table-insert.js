/**
 * Where `table:insert` puts the table: on an empty paragraph, which becomes it;
 * inside a paragraph, which is split around it with the blank lines markdown
 * needs; and at the top of the document, which needs none above it.
 *
 * The table is created through the registry, the way the picker creates one.
 * This probe used to emit the old `table_insert` event: P2 removed the listener
 * for it, and the probe went on measuring a document that never changed — and
 * passing, because the harness only reads the exit status.
 *
 * @covers src/ui/markdown/editing/table.ts, src/ui/markdown/editing/blank_lines.ts
 */
(async () => {
  const t = window.__t;
  const registry = await t.app('/src/ui/markdown/commands/registry.ts');
  const insert = (rows, columns) => registry.runCommand('table:insert', { rows, columns });
  /** The markdown `tableMarkdown` writes, so the expectation is the same shape. */
  const table = (columns, rows) => {
    const header = `| ${Array.from({ length: columns }, () => '').join(' | ')} |`;
    const delimiter = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
    return [header, delimiter, ...Array.from({ length: rows - 1 }, () => header)].join('\n');
  };
  const doc = ['First paragraph.', '', '', 'Second paragraph.', ''].join('\n');
  /** The editor renders on a frame; wait for the shape before reading it. */
  const settle = async (ready) => {
    for (let attempt = 0; attempt < 40 && !ready(); attempt += 1) {
      await t.sleep(50);
    }
    await t.sleep(50);
  };
  const checks = [];
  const check = (name, actual, expected) => {
    checks.push({ name, actual, expected });
  };
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const clickTextEnd = async (needle) => {
    const node = [...t.textNodesIn(t.prose())]
      .find((candidate) => candidate.data.includes(needle));
    const at = node?.data.lastIndexOf(needle);
    if (!node || at < 0) {
      return false;
    }
    const range = document.createRange();
    const end = at + needle.length;
    range.setStart(node, end - 1);
    range.setEnd(node, end);
    const box = range.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      clientX: box.right - 0.5,
      clientY: box.top + box.height / 2
    };
    const target = node.parentElement;
    target.dispatchEvent(new PointerEvent('pointerdown', event));
    target.dispatchEvent(new PointerEvent('pointerup', event));
    target.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(120);
    return true;
  };

  // An empty paragraph becomes the table: it is the line, not a break around it.
  await t.load(doc);
  await t.click(t.blocks()[1], 0.5);
  check('the command ran', insert(3, 2), true);
  await settle(() => t.prose().querySelectorAll('tr').length === 3);
  check(
    'an empty paragraph becomes the table',
    await t.raw(),
    `First paragraph.\n\n${table(2, 3)}\n\nSecond paragraph.\n`
  );
  check('three rows, two of them body rows', t.prose().querySelectorAll('tr').length, 3);
  check('two header cells and four body cells', [
    t.prose().querySelectorAll('thead th').length,
    t.prose().querySelectorAll('tbody td').length
  ], [2, 4]);

  // Inside a paragraph: the paragraph is split, and the table keeps a blank line
  // on the side that would otherwise merge into the text.
  await t.load(doc);
  // The caret goes after the paragraph's last character, aimed at as a character: a click at a
  // fraction of the text's width skims the last glyph, and which side of it the caret lands on
  // depends on the type size (`a4-page.js` scales the page), so the position is named instead.
  const lastLine = t.textNodesIn(t.blocks()[0]).pop();
  const endRange = document.createRange();
  endRange.setStart(lastLine, lastLine.data.length);
  endRange.collapse(true);
  const endRect = endRange.getBoundingClientRect();
  lastLine.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: endRect.left + 1, clientY: endRect.top + 2 })
  );
  await t.sleep(200);
  check('the command ran again', insert(2, 3), true);
  await t.sleep(400);
  check(
    'a paragraph is split around the table',
    await t.raw(),
    `First paragraph.\n\n${table(3, 2)}\n\n\nSecond paragraph.\n`
  );

  // At the very top: nothing above the first line needs separating from, so the
  // table does not push blank lines into the document.
  await t.load('First paragraph.\n');
  await t.click(t.textNodesIn(t.blocks()[0])[0].parentElement, 0);
  check('the command ran at the top', insert(3, 2), true);
  await t.sleep(400);
  check(
    'at the top of the document the table needs nothing above it',
    await t.raw(),
    `${table(2, 3)}\n\nFirst paragraph.\n`
  );

  await t.load('Before\n\n> A quoted paragraph.\n');
  await clickTextEnd('A quoted paragraph.');
  check('the table command runs inside a quote', insert(3, 2), true);
  await t.sleep(300);
  const quoted = await t.raw();
  const quotedRows = quoted.split('\n').filter((line) => line.includes('|'));
  check(
    'every row of a table inserted in a quote carries the quote prefix',
    quotedRows.length === 4 && quotedRows.every((line) => /^> \|/.test(line)),
    true
  );
  check(
    'the quote and its preceding text stay intact',
    quoted.startsWith('Before\n\n> A quoted paragraph.\n> \n> |  |'),
    true
  );

  await t.load('Before\n\n> [!NOTE]\n> A callout body.\n');
  await clickTextEnd('A callout body.');
  check('the table command runs inside a callout', insert(3, 2), true);
  await t.sleep(300);
  const calledOut = await t.raw();
  const calloutRows = calledOut.split('\n').filter((line) => line.includes('|'));
  check(
    'every row of a table inserted in a callout carries the callout prefix',
    calloutRows.length === 4 && calloutRows.every((line) => /^> \|/.test(line)),
    true
  );
  check(
    'the callout marker and body stay intact',
    calledOut.startsWith('Before\n\n> [!NOTE]\n> A callout body.\n> \n> |  |'),
    true
  );

  return { checks, failed: checks.filter((entry) => !same(entry.actual, entry.expected)).map((entry) => entry.name) };
})()
