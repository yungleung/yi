/**
 * Who asks a block's parse for what while typing in it.
 *
 * A plain keystroke renders nothing, so the only thing that used to parse its block
 * was the lookup deciding which source the caret is in (`sourceRangeAt`, through
 * `showSourceAt`) — it read the parse to answer a question the edit cannot have
 * changed. This probe types a burst and reports every `getBlockContent` call by its
 * caller: after the change the caret's lookup is gone, and the calls that remain are
 * the deferred check's — one capture when the burst starts, one comparison when it
 * ends, and that comparison is the burst's single parse.
 *
 * A structural keystroke — an asterisk — is written immediately too, then checked
 * once at the end of the burst. If the parse shape moved, that check rebuilds the
 * block; a star inside an ordinary word changes no shape. A space and a comma are
 * prose and take the same in-place path.
 *
 * @covers src/ui/markdown/editing/context.ts, src/ui/markdown/source_mode/
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  /** Types `keys` at a caret inside `needle`, counting the block's parse calls. */
  const count = async (needle, keys) => {
    await t.load('A paragraph with fairly plain words in it.\n\nsecond\n');
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(needle));
    const caret = document.createRange();
    caret.setStart(node, node.data.indexOf(needle) + 1);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(200);
    const calls = [];
    const original = MarkdownEditorState.prototype.getBlockContent;
    MarkdownEditorState.prototype.getBlockContent = function (wanted) {
      calls.push(
        String(new Error().stack ?? '')
          .split('\n')
          .slice(1, 4)
          .map((line) => line.split('@')[0].trim())
          .join('>')
      );
      return original.call(this, wanted);
    };
    try {
      for (const key of keys) {
        t.key(key);
      }
      // Long enough for the deferred check to fire: it is the burst's one parse.
      await t.sleep(400);
    } finally {
      MarkdownEditorState.prototype.getBlockContent = original;
    }
    const asked = (name) => calls.filter((call) => call.includes(name));
    return {
      calls,
      sameBlock: t.blocks()[0] === block,
      lookups: asked('sourceRangeAt').length,
      checks: asked('verifyBlock').length,
      builds: asked('createBlockElement').length,
      document: await t.raw()
    };
  };

  const plain = await count('fairly', ['x', 'y', 'z']);
  check('a plain burst never asks the caret lookup', plain.lookups === 0, plain.calls);
  check('a plain burst keeps the block', plain.sameBlock, plain.sameBlock);
  check('a plain burst is checked once', plain.checks === 1, plain.calls);
  check(
    'a plain burst reaches the document',
    plain.document === 'A paragraph with fxyzairly plain words in it.\n\nsecond\n',
    plain.document
  );

  const punctuation = await count('fairly', [',', '.']);
  check('a punctuation burst never asks the caret lookup', punctuation.lookups === 0, punctuation.calls);
  check('a punctuation burst keeps the block', punctuation.sameBlock, punctuation.sameBlock);
  check(
    'a punctuation burst reaches the document',
    punctuation.document === 'A paragraph with f,.airly plain words in it.\n\nsecond\n',
    punctuation.document
  );

  const structural = await count('fairly', ['*']);
  check(
    'a structural keystroke never asks the caret lookup',
    structural.lookups === 0,
    structural.calls
  );
  check('a structural keystroke is checked once', structural.checks === 1, structural.calls);
  check(
    'a shape-preserving structural keystroke keeps the block',
    structural.sameBlock,
    structural.sameBlock
  );
  check(
    'a structural keystroke reaches the document',
    structural.document === 'A paragraph with f*airly plain words in it.\n\nsecond\n',
    structural.document
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
