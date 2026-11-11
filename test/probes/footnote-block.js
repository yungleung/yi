/**
 * A footnote written at the end of a paragraph keeps its definition as a block
 * of its own, one blank line below — so a line typed under it stays a line.
 *
 * The button is one edit: the marker at the caret and the definition line at the
 * end, and the caret it leaves is right after the marker, which is why the marker
 * is *shown* as its own source until the author's caret leaves it. The three
 * things this holds: the marker landed in the paragraph and not in the notes, the
 * definition is a block of its own so the paragraph above it cannot grow into it,
 * and both ends are the footnote they were asked for.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  await t.load('Body text.\n\nLast paragraph.\n');
  await t.click(t.blocks()[1], 0.99);
  await t.toolbarAction('Footnote');
  const blocks = [...t.prose().querySelectorAll('.markdown-block')];
  const last = blocks[blocks.length - 1];
  const previous = blocks[blocks.length - 2];
  const definition = last?.querySelector('.markdown-footnote') ?? null;
  check(
    'the definition is a block of its own',
    blocks.length === 3 && definition !== null,
    { blocks: blocks.length, blockTexts: blocks.map((block) => block.textContent) }
  );
  check(
    'and the paragraph above it is a block of its own, without the note in it',
    previous?.querySelector('.markdown-footnote') === null &&
      previous?.textContent?.startsWith('Last paragraph.'),
    previous?.textContent ?? null
  );
  check(
    'the marker went into the paragraph at the caret',
    previous?.querySelector('[data-footnote-ref]')?.dataset.footnoteRef === '1',
    previous?.textContent ?? null
  );
  // The caret the button leaves is right after the marker, so the marker is shown
  // as its own source — `[^1]` — and not as the `[1]` it draws when the caret is
  // somewhere else.
  check(
    'and it is shown as its own source, because the caret is in it',
    previous?.querySelector('[data-footnote-ref].markdown-footnote-source')?.textContent === '[^1]',
    previous?.textContent ?? null
  );
  check(
    'and the definition draws its label as the marker it is',
    definition?.querySelector('[data-footnote-def]')?.textContent === '[1]',
    definition?.textContent ?? null
  );
  await t.click(blocks[0], 0.5);
  // The block is rebuilt when the shown source changes, so the element is asked for
  // again rather than read through the one the probe captured before the click.
  const redrawn = [...t.prose().querySelectorAll('.markdown-block')][1] ?? null;
  check(
    'and a caret that leaves the marker draws it as `[1]`',
    redrawn?.querySelector('[data-footnote-ref]')?.textContent === '[1]',
    redrawn?.textContent ?? null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
