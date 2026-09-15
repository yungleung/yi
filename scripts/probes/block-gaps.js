/**
 * Adjacent blocks whose visible gap is smaller than the paragraph skip.
 *
 * Spacing comes from the content's own margins, so a component that forgets a
 * bottom margin (the footnote definition did) makes the line below it sit
 * closer than every other paragraph break.
 */
(() => {
  const t = window.__t;
  const tight = [];
  const blocks = t.blocks();
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const before = t.textNodesIn(blocks[index]);
    const after = t.textNodesIn(blocks[index + 1]);
    if (before.length === 0 || after.length === 0) {
      continue;
    }
    const last = before[before.length - 1];
    const first = after[0];
    const lastRange = document.createRange();
    lastRange.setStart(last, last.data.length);
    lastRange.collapse(true);
    const firstRange = document.createRange();
    firstRange.setStart(first, 0);
    firstRange.collapse(true);
    const gap = Math.round(
      firstRange.getBoundingClientRect().top - lastRange.getBoundingClientRect().bottom
    );
    if (gap >= 0 && gap < 8) {
      tight.push({
        gap,
        prev: blocks[index].textContent.slice(0, 24),
        next: blocks[index + 1].textContent.slice(0, 24)
      });
    }
  }
  return { tight, blocks: blocks.length };
})()
