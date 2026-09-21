(async () => {
  const t = window.__t;
  await t.load('# Title\n\nfirst line\n\nsecond line\n');
  const firstBlock = t.blocks().find((b) => b.textContent.includes('first line'));
  const secondBlock = t.blocks().find((b) => b.textContent.includes('second line'));
  const first = firstBlock.querySelector('p').getBoundingClientRect();
  const second = secondBlock.querySelector('p').getBoundingClientRect();
  const middle = Math.round((first.bottom + second.top) / 2);
  const clickAt = async (y) => {
    t.scroller().dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: first.left + 10, clientY: y })
    );
    await t.sleep(150);
    return t.caretRect();
  };
  return {
    gap: [Math.round(first.bottom), Math.round(second.top)],
    // The gap is the paragraph margin between the two texts: clicking its
    // upper half belongs to the line above, its lower half to the line below.
    inTopOfMargin: await clickAt(middle - 3),
    inBottomOfMargin: await clickAt(middle + 3),
    belowText: await clickAt(second.bottom + 40)
  };
})()
