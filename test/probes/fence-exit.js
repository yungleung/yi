/**
 * Leaving a fenced block by its own lines.
 *
 * While the caret is inside one, the closing fence is a line like any other (`nodes/fence_text.ts`),
 * so `Enter` at its end makes a blank line under the block and the caret goes there — for all three
 * fenced kinds. A character typed at the body's own end still belongs to the body
 * (`syntax/fence_edits.ts`), whichever side of its last blank line the click landed on.
 *
 * Each case waits for the block it is about to click to *be still* first. A case types into its
 * document (Enter and a letter) and the next one loads over it, so the click that opens a block's
 * own text was being measured against a box that was still moving: a click a line low puts the
 * caret on the closing fence already, where `ArrowDown` leaves the block entirely. Measured before
 * the wait: the display formula's case failed three runs of three (`caretText` `tail` against
 * `$$`) with the first two cases passing, and the same step alone passed.
 *
 * The display formula's case used to fail on its own, and the formula was not the reason: a run of
 * this probe has the app pointed at a workspace, and the app builds the page again when a setting
 * is announced (`src/main.ts` on `config_changed`) — about a second and a half in, which put that
 * rebuild inside the third case, between the `ArrowDown` that placed the caret and the `Enter` that
 * used it. Measured with the caret traced: it went from `text("$$")@2` to `el.prose@1` during the
 * rebuild, because the renderer removed the blocks before the caret was captured, and the `Enter`
 * then read a whole-document range and replaced the note with `"N"`. Fixed in the renderer
 * (`virtual_block_renderer.ts: refresh`), and `test/probes/rebuild-keeps-the-caret.js` is the probe
 * that fails without that fix.
 *
 * @covers src/ui/markdown/editing/text_commands.ts, src/ui/markdown/nodes/fence_text.ts,
 *   src/ui/markdown/syntax/fence_edits.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const caretText = () => caretModule.getCaretRange()?.startContainer.textContent ?? null;
  /**
   * Waits until the element a case is about to click is on screen and its box has been the same
   * across two frames: what the click's point is measured from has stopped moving.
   */
  const still = async (element) => {
    let last = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
      if (!element.isConnected) {
        return false;
      }
      const box = element.getBoundingClientRect();
      const now = [box.top, box.left, box.width, box.height].map(Math.round).join(',');
      if (now === last) {
        return true;
      }
      last = now;
    }
    return false;
  };

  const cases = [
    {
      name: 'a fenced code block',
      doc: 'text\n\n```ts\nlet a = 1;\n```\n\ntail\n',
      enter: () => t.prose().querySelector('.markdown-fenced-code'),
      fence: '```',
      out: 'text\n\n```ts\nlet a = 1;\n```\n\nN\n\ntail\n'
    },
    {
      name: 'the frontmatter',
      doc: '---\nid: 1\n---\n\ntail\n',
      enter: () => t.prose().querySelector('.markdown-frontmatter'),
      fence: '---',
      out: '---\nid: 1\n---\n\nN\n\ntail\n'
    },
    {
      name: 'a display formula',
      doc: '$$\n\\frac{a}{b}\n$$\n\ntail\n',
      enter: () => t.prose().querySelector('[data-display="true"]'),
      fence: '$$',
      out: '$$\n\\frac{a}{b}\n$$\n\nN\n\ntail\n'
    }
  ];

  for (const entry of cases) {
    await t.load(entry.doc);
    const block = entry.enter();
    await still(block);
    await t.click(block, 0.5, 0.5);
    await t.sleep(250);
    t.key('ArrowDown');
    await t.sleep(200);
    check(`${entry.name}: its closing fence is a line the caret can sit on`, caretText(), entry.fence);
    t.key('End');
    await t.sleep(150);
    t.key('Enter');
    await t.sleep(300);
    t.key('N');
    await t.sleep(300);
    check(`${entry.name}: Enter at the fence's end leaves a line under the block`, await t.raw(), entry.out);
  }

  // The body's own end keeps a character in the body, whichever side of the last blank line the
  // click landed on (the rule `syntax/fence_edits.ts: fenceTypedWrite` states).
  await t.load('text\n\n```ts\nlet a = 1;\n\n```\n\ntail\n');
  const lastBlock = t.prose().querySelector('.markdown-fenced-code');
  await still(lastBlock);
  await t.click(lastBlock, 0.99, 0.99);
  await t.sleep(250);
  t.key('W');
  await t.sleep(300);
  check(
    'a click at the body’s own end still types in the body',
    await t.raw(),
    'text\n\n```ts\nlet a = 1;\nW\n```\n\ntail\n'
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
