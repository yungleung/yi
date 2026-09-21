/**
 * The revealable nodes that still reveal their source: a link, typed into at
 * its content end, and a wikilink, deleted into and undone.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(250);
  };
  const doc = 'see [the docs](https://example.com) here\n\n[[Target]] and more\n\nend\n';
  await t.load(doc);
  const link = () => t.prose().querySelector('.markdown-link');
  const linkSource = () => t.prose().querySelector('.markdown-link-source');
  const wikilink = () => t.prose().querySelector('.markdown-wikilink');
  const wikilinkSource = () => t.prose().querySelector('.markdown-wikilink-source');
  const away = () => [...t.prose().querySelectorAll('.markdown-block')].pop();

  // A link reveals its source, and typing lands at the end of its content.
  await t.click(link(), 0.5);
  check('the link shows its source', linkSource()?.textContent ?? null, '[the docs](https://example.com)');
  t.key('X');
  await t.sleep(300);
  check(
    'typing goes at the end of the link text',
    await t.raw(),
    'see [the docsX](https://example.com) here\n\n[[Target]] and more\n\nend\n'
  );
  await t.click(away(), 0.5);
  await t.sleep(300);
  check('and the link renders again', linkSource() === null && link() !== null, true);

  // A wikilink: reveal, delete a character, undo — it renders again each time.
  await t.click(wikilink(), 0.5);
  check('the wikilink shows its source', wikilinkSource()?.textContent ?? null, '[[Target]]');
  t.key('Backspace');
  await t.sleep(250);
  check(
    'deleting lands in the wikilink source',
    await t.raw(),
    'see [the docsX](https://example.com) here\n\n[[Targe]] and more\n\nend\n'
  );
  await emit('undo');
  await t.click(away(), 0.5);
  await t.sleep(300);
  check('and undo brings the rendering back', wikilinkSource() === null && wikilink() !== null, true);
  check(
    'with the document intact',
    await t.raw(),
    'see [the docsX](https://example.com) here\n\n[[Target]] and more\n\nend\n'
  );

  // A citation and an image show their own source the same way.
  await t.load('see [@key] here\n\n![alt text](https://example.com/x.png) and tail\n');
  const citation = () => t.prose().querySelector('.markdown-citation');
  const citationSource = () => t.prose().querySelector('.markdown-citation-source');
  const image = () => t.prose().querySelector('img');
  const imageSource = () => t.prose().querySelector('.markdown-image-source');
  await t.click(citation(), 0.5);
  check('the citation shows its source', citationSource()?.textContent ?? null, '[@key]');
  t.key('X');
  await t.sleep(250);
  check(
    'typing lands at the end of the citation key',
    await t.raw(),
    'see [@keyX] here\n\n![alt text](https://example.com/x.png) and tail\n'
  );
  await t.click(away(), 0.5);
  await t.sleep(250);
  check('and the citation renders again', citationSource() === null && citation() !== null, true);

  await t.click(image(), 0.5);
  check(
    'the image shows its source',
    imageSource()?.textContent ?? null,
    '![alt text](https://example.com/x.png)'
  );
  t.key('X');
  await t.sleep(250);
  check(
    'typing lands at the end of the alt text',
    await t.raw(),
    'see [@keyX] here\n\n![alt textX](https://example.com/x.png) and tail\n'
  );
  await t.click(t.prose().querySelector('.markdown-block'), 0.2);
  await t.sleep(250);
  check('and the image renders again', imageSource() === null && image() !== null, true);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()
