(async () => {
  const t = window.__t;
  const out = t.report({});
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(200);
  };

  await t.load('a\n\n\nb\n');
  const line = t.blocks().find((b) => b.querySelector('.markdown-empty-line-placeholder'));
  await t.click(line.querySelector('.markdown-empty-line-placeholder'));
  t.key('x');
  await t.sleep(200);
  out.typed = await t.raw();
  await emit('undo');
  out.undone = await t.raw();
  await emit('redo');
  out.redone = await t.raw();

  const document = '# H\n\ntext\n';
  await t.load(document);
  const copied = await t.raw();
  out.copyRoundTrip = { same: copied === document, copied };
  return out;
})()
