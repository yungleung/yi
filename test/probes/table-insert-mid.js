(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const doc = ['First paragraph.', '', '', 'Second paragraph.', ''].join('\n');

  await t.load(doc);
  t.report({ stage: 'loaded' });
  const text = t.textNodesIn(t.blocks()[0]).pop().parentElement;
  await t.click(text, 0.99);
  t.report({ stage: 'clicked', caret: t.caretRect() });
  await emit('table_insert', { rows: 2, columns: 3 });
  await t.sleep(300);
  t.report({ stage: 'inserted', caret: t.caretRect() });
  const raw = await t.raw();
  t.report({ stage: 'copied', raw });
  return {
    raw,
    caret: t.caretRect(),
    blocks: t.blocks().map((block) => ({
      lineStart: Number(block.dataset.lineStart),
      text: block.textContent.slice(0, 20)
    }))
  };
})()
