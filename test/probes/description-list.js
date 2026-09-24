/**
 * A description list in the running app, holding the nodes the list plugin cannot write.
 *
 * The plugin rebuilds a list by serializing its paragraph with a CommonMark-only writer,
 * so a citation, a wikilink or inline math in a term or a detail made *opening the note*
 * throw — and an entity in one made the position repair give up silently, leaving every
 * offset in the list relative to a fragment it was re-parsed from. So this probe opens
 * the two shapes a description list is written in (a blank line between the term and its
 * detail, and none), reads what the widgets are, and types inside the detail: the
 * character has to reach the document exactly where the document says it is.
 *
 * A footnote reference in a detail is the same story one step on: a term and a detail are
 * re-parsed from their own lines, so the definition that makes a reference a reference is
 * borrowed for the re-parse and dropped again — rendered once, where the document keeps
 * it, and not inside the list that borrowed it.
 *
 * @covers src/ui/markdown/syntax/parser.ts, src/ui/markdown/nodes/citation.ts,
 *   src/ui/markdown/nodes/wikilink.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /**
   * Loads `markdown`, puts the caret `inside` characters into the first rendering of
   * `needle`, types `key`, and reports the document and what it should be — the offset
   * mapping the description list's re-parse has to keep exact.
   */
  const typeAt = async (markdown, needle, inside, key) => {
    await t.load(markdown);
    const block = t.blocks().find((element) => element.textContent.includes(needle));
    const node = block ? t.textNodesIn(block).find((leaf) => leaf.data.includes(needle)) : null;
    if (!node) {
      return { error: 'nothing to type into' };
    }
    const caret = document.createRange();
    caret.setStart(node, node.data.indexOf(needle) + inside);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(150);
    t.key(key);
    await t.sleep(250);
    const at = markdown.indexOf(needle) + inside;
    return {
      document: await t.raw(),
      expected: `${markdown.slice(0, at)}${key}${markdown.slice(at)}`
    };
  };

  // The two-line shape: a term, a blank line, then its detail. A citation in the term is
  // the case that used to throw before the note could even render.
  const split = 'a term with @smith2020\n\n: a detail with a sentence in it\n\nsecond\n';
  await t.load(split);
  check(
    'the citation in the term renders',
    t.prose().querySelector('.markdown-citation') !== null,
    t.prose().textContent
  );
  check(
    'and the detail is on the page',
    t.prose().textContent.includes('a detail with a sentence in it'),
    t.prose().textContent
  );
  const inSplitDetail = await typeAt(split, 'sentence', 3, 'x');
  check(
    'typing in the detail lands where the document says',
    inSplitDetail.document === inSplitDetail.expected,
    inSplitDetail
  );

  // The one-paragraph shape, holding an entity, a wikilink and inline math beside prose.
  const single = 'the term\n: a detail with an entity &amp; a [[Note]] and $x + y$ in it\n';
  await t.load(single);
  const rendered = t.prose().textContent;
  check('the wikilink in the detail renders', t.prose().querySelector('.markdown-wikilink') !== null, rendered);
  check(
    'the math in the detail renders',
    t.prose().querySelector('[data-math][data-display="false"]') !== null,
    rendered
  );
  check('and the entity renders as its character', rendered.includes('entity & a'), rendered);
  const inSingleDetail = await typeAt(single, 'entity', 3, 'y');
  check(
    'typing before the entity lands where the document says',
    inSingleDetail.document === inSingleDetail.expected,
    inSingleDetail
  );
  const afterMath = await typeAt(single, 'in it', 2, 'z');
  check(
    'and typing after three widgets lands where the document says',
    afterMath.document === afterMath.expected,
    afterMath
  );

  // A footnote reference in the detail, with its definition below the list: the reference
  // has to render as a reference, and the borrowed definition may not land in the list.
  const cited = 'a term\n: a detail with a note[^1] in it\n\n[^1]: the note itself\n';
  await t.load(cited);
  const blocks = t.blocks();
  check(
    'the reference in the detail renders',
    t.prose().querySelector('[data-footnote-ref]') !== null,
    t.prose().textContent
  );
  check(
    'and the definition it borrowed is not inside the list',
    !(blocks[0]?.textContent ?? '').includes('the note itself'),
    blocks[0]?.textContent ?? null
  );
  check(
    'it still renders as its own block',
    blocks.some((block) => block.textContent.includes('the note itself')),
    blocks.map((block) => block.textContent)
  );
  const afterReference = await typeAt(cited, 'in it', 2, 'w');
  check(
    'and typing after the reference lands where the document says',
    afterReference.document === afterReference.expected,
    afterReference
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
