/**
 * The notes form one run: the first definition is set off from the body by a
 * blank line, and a second footnote joins it on the next line.
 */
(async () => {
  const t = window.__t;
  const button = () =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Footnote'
    );
  const press = async () => {
    const target = button();
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.click();
    await t.sleep(300);
  };
  const measure = () => {
    const blocks = [...t.prose().querySelectorAll('.markdown-block')];
    const definitions = [...t.prose().querySelectorAll('.markdown-footnote')];
    const paragraph = t.prose().querySelector('p');
    return {
      blocks: blocks.length,
      blockTexts: blocks.map((block) => block.textContent),
      definitions: definitions.length,
      definitionsInOneBlock: new Set(definitions.map((d) => d.closest('.markdown-block'))).size,
      gapFromBody: paragraph && definitions.length
        ? Math.round(definitions[0].getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom)
        : null,
      gapBetweenDefinitions: definitions.length > 1
        ? Math.round(definitions[1].getBoundingClientRect().top - definitions[0].getBoundingClientRect().bottom)
        : null,
      sups: t.prose().querySelectorAll('sup').length
    };
  };
  await t.load('Body text.\n');
  await t.click(t.blocks()[0], 0.99);
  await press();
  t.report({ afterOne: measure() });
  await press();
  const afterTwo = measure();
  t.report({ afterOne: null, afterTwo });
  return { afterTwo };
})()
