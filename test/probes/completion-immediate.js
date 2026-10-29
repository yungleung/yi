/**
 * Completion opens as soon as its marker is typed; Tab is never the trigger.
 *
 * @covers src/ui/markdown/editing/completions.ts
 * @needs-workspace — citation and wikilink entries come from the fixture workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual) =>
    checks.push({ name, actual, expected: true, pass: actual === true });
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

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
