/**
 * The default fixture demonstrates document-owned listing labels and prefixes.
 *
 * @covers test/fixtures/workspace/default-document.md
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

  let section = null;
  for (let fraction = 0.02; section === null && fraction <= 1; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    const heading = [...t.prose().querySelectorAll('h2')].find(
      (heading) => heading.textContent === 'Code listings'
    );
    if (heading !== undefined) {
      section = heading;
    }
  }
  if (section !== null) {
    const viewport = t.scroller().getBoundingClientRect();
    const heading = section.getBoundingClientRect();
    t.scroller().scrollTop += heading.top - viewport.top - 80;
  }
  await t.sleep(350);

  const listings = [...t.prose().querySelectorAll('.markdown-listing-block')];
  check('the fixture shows all three listing cases', listings.length, 3);
  check(
    'caption-only stays unnumbered',
    listings[0]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'An unnumbered example'
  );
  check(
    'ID-only uses configured label and prefix',
    listings[1]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'Code excerpt 2-1.'
  );
  check(
    'ID and caption use the configured wording',
    listings[2]?.querySelector('.markdown-listing-caption')?.textContent?.trim() ?? null,
    'Code excerpt 2-2. A captioned example'
  );
  check(
    'the automatic reference uses the same wording',
    t.prose().querySelector('[data-auto-reference="lst:minimal"]')?.textContent ?? null,
    'Code excerpt 2-1'
  );
  check(
    'the manual reference keeps its authored words',
    [...t.prose().querySelectorAll('a')].find(
      (anchor) => anchor.getAttribute('href') === '#lst:sample'
    )?.textContent ?? null,
    'the captioned listing'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
