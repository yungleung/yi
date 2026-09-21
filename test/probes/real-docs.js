/**
 * @needs-source-workspace — drives the workspace tree, so it needs the maintainer's own notes folder open.
 */
(async () => {
  const t = window.__t;
  const row = (label) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const file = (prefix) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(prefix));
  const sidebar = () => {
    let node = row('Physics')?.parentElement;
    while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    return node;
  };
  const report = (name) => ({
    name,
    blocks: t.blocks().length,
    scrollHeight: Math.round(t.scroller().scrollHeight),
    emptyLines: t.emptyLines().length
  });

  const out = [];
  row('Physics')?.click();
  await t.sleep(600);
  row('Theoretic Mechanics')?.click();
  await t.sleep(600);
  file('Geometric and Kinematic')?.click();
  await t.sleep(1500);
  out.push(report('math document'));

  sidebar().scrollTop = sidebar().scrollHeight;
  await t.sleep(400);
  row('Western Philosophy')?.click();
  await t.sleep(700);
  row('Hannah Arendt')?.click();
  await t.sleep(700);
  file('The Human Condition')?.click();
  await t.sleep(2500);
  out.push(report('The Human Condition'));
  return out;
})()
