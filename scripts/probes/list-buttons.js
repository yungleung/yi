/**
 * The list buttons: a paragraph becomes the kind the button names, another
 * kind is rewritten, and the same kind again takes the list away.
 */
(async () => {
  const t = window.__t;
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const shape = () => ({
    ordered: t.prose().querySelectorAll('ol').length,
    bullets: t.prose().querySelectorAll('ul').length,
    checkboxes: t.prose().querySelectorAll('input[type="checkbox"]').length,
    text: t.prose().querySelector('.markdown-node')?.textContent ?? null
  });
  const steps = {};
  await t.load('a paragraph line\n');
  await t.click(t.blocks()[0]);
  steps.plain = shape();
  t.report(steps);
  button('Ordered list').click();
  await t.sleep(250);
  steps.ordered = shape();
  t.report(steps);
  button('Bullet list').click();
  await t.sleep(250);
  steps.bullet = shape();
  t.report(steps);
  button('Task list').click();
  await t.sleep(250);
  steps.task = shape();
  t.report(steps);
  button('Task list').click();
  await t.sleep(250);
  steps.toggledOff = shape();
  return steps;
})()
