(async () => {
  const t = window.__t;
  const out = t.report({});

  // A blank list item still deletes only its own line, and typing takes the
  // caret's place at the end of the item above.
  await t.load('- a\n- \n- b\n');
  const item = t.blocks().find((b) => b.textContent.includes('a'));
  await t.click(item.querySelector('.markdown-list-placeholder').closest('li'));
  t.key('Backspace');
  await t.sleep(200);
  out.afterDelete = await t.raw();
  t.key('x');
  await t.sleep(200);
  out.afterTyping = await t.raw();

  // Task-list checkboxes still rewrite the marker.
  await t.load('- [ ] task one\n- [ ] task two\n');
  t.prose()
    .querySelectorAll('input[type="checkbox"]')[0]
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await t.sleep(200);
  out.taskToggle = await t.raw();
  return out;
})()
