(async () => {
  const t = window.__t;
  // One case per run: the bridge's budget does not fit several document swaps,
  // so the rest of the run rule is checked in Node (test/checks/check-blocks.mjs).
  await t.load('a\n\n\nb');
  return {
    raw: await t.raw(),
    emptyLines: t.emptyLines(),
    blocks: t.blocks().map((block) => block.textContent)
  };
})()
