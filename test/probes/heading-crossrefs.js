/**
 * Command-clicking a same-document fragment reveals and focuses its heading.
 *
 * The gesture must stay inside the editor, resolve automatic, duplicate, custom
 * and setext heading IDs, and report a missing target without moving the page.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/editing/headings.ts,
 *   src/ui/markdown/document/heading_index.ts
 * @fixture test/fixtures/workspace/default-document.md
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

  const targetParagraphs = Array.from(
    { length: 36 },
    (_, index) => `Filler paragraph ${index}.`
  ).join('\n\n');
  const doc =
    '# Start\n\n' +
    '[Automatic](#a-heading)\n\n' +
    '[Duplicate](#a-heading-1)\n\n' +
    '[Custom](#methods)\n\n' +
    '[Setext](#setext-title)\n\n' +
    '[Missing](#missing)\n\n' +
    `${targetParagraphs}\n\n` +
    '# A Heading\n\n' +
    '# A Heading\n\n' +
    '## Methods {#methods .unnumbered}\n\n' +
    'Setext title {#setext-title .unnumbered}\n========================================\n\n' +
    'Target text.\n';

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

  const reach = async (fragment, selector) => {
    await t.load(doc);
    const hashBefore = location.hash;
    const anchor = t.prose().querySelector(`a.markdown-link[href="${fragment}"]`);
    const notCancelled = commandClick(anchor);
    await t.sleep(350);
    const heading = [...t.prose().querySelectorAll(selector)].find(
      (element) => element.id === fragment.slice(1)
    );
    const headingBox = heading?.getBoundingClientRect() ?? null;
    const caret = t.caretRect();
    const headingTitle = heading?.cloneNode(true) ?? null;
    if (headingTitle instanceof Element) {
      headingTitle.querySelector('.markdown-heading-attributes-source')?.remove();
    }
    return {
      hashBefore,
      hashAfter: location.hash,
      notCancelled,
      scrollTop: t.scroller()?.scrollTop ?? null,
      heading: headingTitle?.textContent?.trim() ?? null,
      attributesShown:
        heading?.querySelector('.markdown-heading-attributes-source')?.textContent ?? null,
      caretOnHeading:
        caret !== null &&
        headingBox !== null &&
        caret.y >= headingBox.top - 4 &&
        caret.y <= headingBox.bottom + 4
    };
  };

  const automatic = await reach('#a-heading', 'h1');
  check('an automatic ID reaches the first heading', automatic.heading, 'A Heading');
  check('the command-click is cancelled before the webview follows it', automatic.notCancelled, false);
  check('the webview hash never changes', [automatic.hashAfter, automatic.hashBefore], ['', '']);
  check('the distant target scrolls into view', automatic.scrollTop > 0, true);
  check('the caret lands on the heading', automatic.caretOnHeading, true);

  const duplicate = await reach('#a-heading-1', 'h1');
  check('the duplicate suffix reaches the second heading', duplicate.heading, 'A Heading');
  check('and still focuses that heading', duplicate.caretOnHeading, true);

  const custom = await reach('#methods', 'h2');
  check('a custom ID reaches its heading', custom.heading, 'Methods');
  check('and reveals the custom attributes at the target', custom.attributesShown, '{#methods .unnumbered}');
  check('and focuses the custom heading', custom.caretOnHeading, true);

  const setext = await reach('#setext-title', 'h1');
  check('a setext heading has its explicit target', setext.heading, 'Setext title');
  check(
    'and reveals the setext attributes at the target',
    setext.attributesShown,
    '{#setext-title .unnumbered}'
  );
  check('and command-click focuses it', setext.caretOnHeading, true);

  await t.load(doc);
  const missingHash = location.hash;
  commandClick(t.prose().querySelector('a.markdown-link[href="#missing"]'));
  await t.sleep(250);
  const messages = [...document.querySelectorAll('[data-message-text]')].map(
    (element) => element.textContent
  );
  check('a missing target leaves the hash alone', location.hash, missingHash);
  check(
    'and says which heading is missing',
    messages.some((message) => message?.includes('missing')),
    true
  );
  for (const close of [...document.querySelectorAll('[data-message-close]')]) {
    close.click();
  }

  await t.load('See [local](#target).\n');
  t.prose().querySelector('a.markdown-link').dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true })
  );
  await t.sleep(250);
  check(
    'a plain click still opens the link source',
    t.prose().querySelector('.markdown-link-source')?.textContent ?? null,
    '[local](#target)'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
