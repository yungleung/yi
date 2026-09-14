(async () => {
  const t = window.__t;
  const row = (label) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const file = (prefix) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(prefix));
  row('Physics')?.click();
  await t.sleep(600);
  row('Theoretic Mechanics')?.click();
  await t.sleep(600);
  file('Geometric and Kinematic')?.click();
  await t.sleep(1200);
  return {
    blocks: t.blocks().length,
    scrollHeight: Math.round(t.scroller().scrollHeight),
    emptyLines: t.emptyLines().length,
    head: t.prose().textContent.slice(0, 60)
  };
})()
