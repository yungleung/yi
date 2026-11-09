/**
 * Consecutive definitions in one block keep their own labels, and each marker's hover
 * preview reads the definition that marker names rather than the first in the block.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/footnote_preview.ts,
 *   src/ui/markdown/syntax/footnote/
 * @needs-large-document
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const normalize = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

  t.scroller().scrollTop = t.scroller().scrollHeight;
  await t.sleep(700);

  const definitions = [...t.prose().querySelectorAll('[data-footnote-def]')];
  check(
    'every definition in a consecutive notes block draws its own label',
    definitions.length === 41 &&
      definitions.every((element, index) => element.textContent === `[${index + 1}]`),
    definitions.map((element) => element.textContent)
  );

  const hover = async (element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
    await t.sleep(450);
  };
  const definitionStart = (id) =>
    normalize(
      t.prose().querySelector(`[data-footnote-def="${id}"]`)?.parentElement?.textContent
    )
      .replace(`[${id}]`, '')
      .trim()
      .slice(0, 24);

  for (const id of ['36', '41']) {
    const marker = t.prose().querySelector(`[data-footnote-ref="${id}"]`);
    check(`the ${id} marker is mounted at the end of the note`, marker !== null, Boolean(marker));
    if (!marker) {
      continue;
    }
    await hover(marker);
    const preview = normalize(
      document.querySelector('.markdown-footnote-preview')?.textContent
    );
    check(
      `hovering the ${id} marker previews definition ${id}`,
      preview.includes(definitionStart(id)),
      { expected: definitionStart(id), actual: preview.slice(0, 80) }
    );
    t.prose().dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
    );
    await t.sleep(350);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
