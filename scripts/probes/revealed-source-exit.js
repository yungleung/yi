(async () => {
  const t = window.__t;
  const blocks = [...t.prose().querySelectorAll('.markdown-block')];
  await t.click(blocks[blocks.length - 1]);
  await t.sleep(500);
  return {
    katex: t.prose().querySelectorAll('.katex').length,
    sourceOpen: t.prose().querySelector('.markdown-math-source') !== null,
    blocks: [...t.prose().querySelectorAll('.markdown-block')].map((b) => ({ lines: b.dataset.lineStart, text: b.textContent.slice(0, 22) })),
    proseText: t.prose().textContent.slice(0, 60)
  };
})()
