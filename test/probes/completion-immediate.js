/**
 * Completion opens as soon as its marker is typed; Tab is never the trigger.
 *
 * @covers src/ui/markdown/editing/completions.ts
 * @needs-workspace — citation and wikilink entries come from the fixture workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected = true) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const cardOpen = () =>
    document.querySelector('[data-completion]')?.classList.contains('hidden') === false;
  const placeAtEnd = async (needle) => {
    const block = t.blocks().find((candidate) => candidate.textContent?.includes(needle));
    const text = block ? t.textNodesIn(block)[0] : null;
    const at = text?.data.lastIndexOf(needle);
    if (!text || at < 0) return false;
    const range = document.createRange();
    const end = at + needle.length;
    range.setStart(text, end);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 1,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(120);
    return true;
  };
  const type = async (keys) => {
    for (const key of keys) t.key(key);
    await t.sleep(180);
  };
  const commit = async (text) => {
    const seam = document.querySelector('.markdown-composition-input');
    seam.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    seam.value = text;
    seam.dispatchEvent(new CompositionEvent('compositionend', { data: text, bubbles: true }));
    await t.sleep(180);
  };

  await t.load('# Target\n\nSee \n');
  await placeAtEnd('See');
  await type(['[', '#']);
  check('automatic references open on the marker without Tab', cardOpen());
  t.key('Escape');

  await t.load('See \n\n[[Note]]\n');
  await placeAtEnd('See');
  await type(['[', '[']);
  check('wikilinks open on the marker without Tab', cardOpen());
  t.key('Escape');

  await t.load('See \n\n[[Note]]\n');
  await placeAtEnd('See\u00a0');
  await type(['@']);
  check('citations open on the marker without Tab', cardOpen());

  await t.load('# Target\n\nSee \n');
  await placeAtEnd('See');
  await commit('[#');
  check('automatic references open when their marker is committed', cardOpen());
  t.key('Escape');

  await t.load('See \n\n[[Note]]\n');
  await placeAtEnd('See');
  await commit('[[');
  check('wikilinks open when their marker is committed', cardOpen());
  t.key('Escape');

  await t.load('See \n\n[[Note]]\n');
  await placeAtEnd('See\u00a0');
  await commit('@');
  check('citations open when their marker is committed', cardOpen());
  t.key('Escape');

  await t.load('# Target\n\nSee [the target]()\n');
  const link = t.prose().querySelector('.markdown-link');
  if (link) {
    await t.click(link);
    await t.sleep(120);
  }
  const linkSource = t.prose().querySelector('.markdown-link-source');
  const linkText = linkSource
    ? t.textNodesIn(linkSource).find((node) => node.data.includes(')'))
    : null;
  if (linkText) {
    const close = linkText.data.indexOf(')');
    const range = document.createRange();
    range.setStart(linkText, close);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    linkText.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 1,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(140);
    await type(['#']);
  }
  const linkOpen = cardOpen();
  const linkRows = [...document.querySelectorAll('[data-completion-row]')].map((row) =>
    row.getAttribute('data-completion-row')
  );
  check('ordinary link fragment completion opens on #', linkOpen);
  check('and offers the document target', linkRows.includes('target'), true);
  t.key('Enter');
  await t.sleep(160);
  check(
    'accepting it writes only the fragment ID',
    await t.raw(),
    '# Target\n\nSee [the target](#target)\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
