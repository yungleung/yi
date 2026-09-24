/**
 * Where one keystroke's milliseconds go, inside the app's own path.
 *
 * A keystroke that the plain write refuses takes the ordinary path: decide what source is
 * shown, rebuild the block it landed in, place the caret, keep the scroll. Three of those are
 * methods on objects a probe can reach — the renderer's `renderBlock`, `measureEditedBlock`
 * and `renderChanged`, and the state's `getBlockContent` (the parse) — so this probe times
 * them from the inside, exclusive of one another, while the author's keystroke runs, and
 * reports what is left over.
 *
 * It exists because two designs aimed at a code block's rebuild and both came back equal in
 * cost (P24: re-rendering the markup in place, 31 ms against 25; P27: writing into the
 * highlighted text node, 28 against 30). Both avoided the *rebuild* and neither got cheaper,
 * which means the time is somewhere else in this path — and this is the measurement that says
 * where. The paragraph is the control: the same instrumentation on a keystroke whose write
 * *is* taken, which is 2–4 ms.
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editing/context.ts
 * @needs-large-document — the code document is a block of the fixture note's size.
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { VirtualBlockRenderer } = await t.app('/src/ui/markdown/virtual_block_renderer.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const codeLines = Array.from(
    { length: 80 },
    (_, index) => `const fairlyPlain${index} = someFairlyLongFunction(argument${index});`
  );
  const paragraphs = Array.from(
    { length: 40 },
    (_, index) => `A fairly plain paragraph number ${index} with enough words to wrap over a line.`
  );
  const cases = [
    {
      label: 'a letter inside a big fenced code block',
      document: `\`\`\`js\n${codeLines.join('\n')}\n\`\`\`\n`,
      needle: 'fairlyPlain0'
    },
    {
      label: 'a letter inside a paragraph',
      document: `${paragraphs.join('\n\n')}\n`,
      needle: 'paragraph'
    }
  ];

  /** Times the calls of one keystroke, exclusive of the ones nesting inside them. */
  const timed = () => {
    const open = [];
    const parts = {};
    const wrap = (owner, name) => {
      const original = owner[name];
      owner[name] = function (...args) {
        const entry = { name, started: performance.now(), nested: 0 };
        open.push(entry);
        try {
          return original.apply(this, args);
        } finally {
          open.pop();
          const total = performance.now() - entry.started;
          const exclusive = Math.max(0, total - entry.nested);
          const part = (parts[name] ??= { calls: 0, ms: 0 });
          part.calls += 1;
          part.ms += exclusive;
          const parent = open[open.length - 1];
          if (parent) {
            parent.nested += total;
          }
        }
      };
      return () => {
        owner[name] = original;
      };
    };
    const restore = [
      wrap(VirtualBlockRenderer.prototype, 'renderChanged'),
      wrap(VirtualBlockRenderer.prototype, 'renderBlock'),
      wrap(VirtualBlockRenderer.prototype, 'measureEditedBlock'),
      wrap(MarkdownEditorState.prototype, 'getBlockContent')
    ];
    return {
      parts,
      stop: () => restore.forEach((undo) => undo())
    };
  };

  const results = [];
  for (const entry of cases) {
    await t.load(entry.document);
    const block = t.blocks()[0];
    const node = t.textNodesIn(block).find((leaf) => leaf.data.includes(entry.needle));
    const caret = document.createRange();
    caret.setStart(node, node.data.indexOf(entry.needle) + 2);
    caret.collapse(true);
    const box = caret.getBoundingClientRect();
    node.parentElement.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left,
        clientY: box.top + box.height / 2
      })
    );
    await t.sleep(120);
    // The floor: the same block parsed and built again, detached, with no page involved.
    const built = performance.now();
    const state = new MarkdownEditorState(entry.document);
    const fresh = state.getBlocks()[0];
    if (fresh) {
      createBlockComponent(fresh, state.getBlockContent(fresh));
    }
    const detachedMs = Math.round((performance.now() - built) * 10) / 10;

    const before = t.scroller().scrollHeight;
    const watched = timed();
    const started = performance.now();
    t.key('x');
    const keystrokeMs = Math.round((performance.now() - started) * 10) / 10;
    const parts = Object.fromEntries(
      Object.entries(watched.parts).map(([name, part]) => [
        name,
        { calls: part.calls, ms: Math.round(part.ms * 10) / 10 }
      ])
    );
    watched.stop();
    await t.sleep(250);
    results.push({
      label: entry.label,
      keystrokeMs,
      detachedMs,
      parts,
      accountedMs: Math.round(Object.values(parts).reduce((sum, part) => sum + part.ms, 0) * 10) / 10,
      scrollHeightChange: t.scroller().scrollHeight - before
    });
  }
  return { results };
})()
