/**
 * A click that reveals a citation or a wikilink does not freeze the page.
 *
 * The click rebuilds its block, and a rebuild that asks the browser for anything it has to lay the
 * document out to answer — the scroller's `scrollTop` and `clientHeight` are the ones that were
 * being asked for — spends that layout inside the task the click runs in: measured at 148, 102 and
 * 149 ms, nine frames of the page not painting. A reader sees that as the paragraph blinking, and no
 * probe that reads layout can see it: the numbers are stable throughout. What can be seen is the
 * time, so this watches the click's own work and the frames around it.
 *
 * The bounds are set from the two builds: before this was fixed a click took 102–149 ms of the task
 * and the frames around it opened gaps of 123–169 ms; after, 38–71 ms and 57–86 ms. A click over
 * 90 ms, or a frame gap over 110 ms, is the freeze this test was written for.
 *
 * The tree opens the workspace's own documents first because that is the reader's path, and the
 * clicks need a citation and a wikilink to reveal (`--with-workspace`).
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts
 * @needs-workspace
 * @needs-foreground-window — an occluded webview suspends animation frames, and the frame trace
 * then measures nothing at all.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const openFromTree = async (name) => {
    const rowFor = () =>
      [...document.querySelectorAll('[data-tree-path]')].find(
        (row) => (row.dataset.treePath ?? '').split('/').pop() === name
      );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = rowFor();
      if (row) {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await t.sleep(1100);
        return true;
      }
      await t.sleep(100);
    }
    return false;
  };
  const citationOf = () =>
    [...t.prose().querySelectorAll('.markdown-citation')].find((element) =>
      /smith2020|Smith|Abel/.test(element.textContent ?? '')
    ) ?? null;
  const wikilinkOf = () => t.prose().querySelector('.markdown-wikilink');
  const onScreen = (element) => {
    if (!element) {
      return false;
    }
    const box = element.getBoundingClientRect();
    return box.top >= 8 && box.bottom <= window.innerHeight - 8;
  };

  check('the tree offers README.md', await openFromTree('README.md'), true);
  check('and the default document', await openFromTree('default-document.md'), true);
  const first = document.querySelector('.prose .markdown-block');
  if (first) {
    await t.click(first, 0.9);
  }
  await t.sleep(300);
  let section = [...document.querySelectorAll('.prose .markdown-block')].find((block) =>
    (block.textContent ?? '').includes('Pandoc-style citations')
  );
  for (let fraction = 0.1; fraction <= 1.0001 && !section; fraction += 0.02) {
    t.scroller().scrollTop = t.scroller().scrollHeight * fraction;
    await t.sleep(100);
    section = [...document.querySelectorAll('.prose .markdown-block')].find((block) =>
      (block.textContent ?? '').includes('Pandoc-style citations')
    );
  }
  section?.scrollIntoView({ block: 'center' });
  await t.sleep(1500);

  const frames = [];
  let running = true;
  const sample = (stamp) => {
    if (!running) {
      return;
    }
    frames.push(Math.round(stamp));
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  await t.sleep(250);

  const sync = [];
  const gaps = [];
  const click = async (label, pick) => {
    let element = pick();
    if (element && !onScreen(element)) {
      // The reader clicks what they can see, so bring it into view rather than clicking blind.
      t.scroller().scrollTop += element.getBoundingClientRect().top - 260;
      await t.sleep(300);
      element = pick();
    }
    if (!onScreen(element)) {
      check(`the ${label} is where the reader can click it`, false, Boolean(element));
      return;
    }
    check(`the ${label} is where the reader can click it`, true, true);
    const box = element.getBoundingClientRect();
    const at = {
      clientX: Math.round(box.left + box.width / 2),
      clientY: Math.round(box.top + box.height / 2)
    };
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, ...at }));
    await t.sleep(300);
    const mark = frames.length;
    const started = performance.now();
    element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...at })
    );
    sync.push({ label, ms: Math.round(performance.now() - started) });
    await t.sleep(900);
    let worst = 0;
    for (let i = Math.max(1, mark); i < frames.length; i += 1) {
      worst = Math.max(worst, frames[i] - frames[i - 1]);
    }
    gaps.push({ label, ms: worst });
  };

  await click('citation', citationOf);
  await click('wikilink', wikilinkOf);
  await click('citation', citationOf);
  running = false;

  // An empty trace means the window was not painting (occluded, or suspended), and every gap below
  // would then be vacuously small.
  check('the page was painting while this ran', frames.length > 40, frames.length);
  const frozen = sync.filter((entry) => entry.ms > 90);
  check('no click freezes the page for more than a few frames', frozen.length === 0, sync);
  const frameGapLimit = t.platform() === 'linux' ? 130 : 110;
  const held = gaps.filter((entry) => entry.ms > frameGapLimit);
  check('and the frames around it keep coming', held.length === 0, gaps);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
