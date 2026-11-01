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
 * The second instrument is the one the first could not see: every geometry read the browser
 * answers, timed *inside the getter* and reported with the frame that asked for it. A read made
 * after the block's element was swapped is what makes the browser lay the page out again, so the
 * cost of that layout is inside the first such read, and a caller that is not one of the wrapped
 * methods (the caret's placement, the scroll's own read) is named here rather than counted as
 * "left over".
 *
 * @covers src/ui/markdown/virtual_block_renderer.ts, src/ui/markdown/editing/context.ts
 * @needs-large-document — the code document is a block of the fixture note's size.
 *
 * Nine warm rounds a case, so it outruns the bridge's five seconds on its own: the harness says so and
 * reads the result out of the page's stash (`export-pdf.js` is the other one that does).
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { VirtualBlockRenderer } = await t.app('/src/ui/markdown/virtual_block_renderer.ts');
  const { createBlockComponent } = await t.app('/src/ui/markdown/create_block.ts');
  const { plainRun } = await t.app('/src/ui/markdown/editing/typed_text.ts');
  const { domPositionAtOffset } = await t.app('/src/ui/markdown/caret/dom_position.ts');
  const { sourceRangeAt } = await t.app('/src/ui/markdown/editing/source_range.ts');
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
          const part = (parts[name] ??= { calls: 0, ms: 0, inclusive: 0 });
          part.calls += 1;
          part.ms += exclusive;
          // Inclusive as well as exclusive: what a method's *children* cost is inside its own time,
          // and a child nothing wraps (the block's build, inside `syncWindow`) is only visible there.
          part.inclusive += total;
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
      wrap(VirtualBlockRenderer.prototype, 'syncWindow'),
      wrap(MarkdownEditorState.prototype, 'getBlockContent'),
      wrap(MarkdownEditorState.prototype, 'getBlocks'),
      wrap(MarkdownEditorState.prototype, 'getText'),
      wrap(MarkdownEditorState.prototype, 'getBlockAtOffset'),
      wrap(MarkdownEditorState.prototype, 'getBlockAtLine'),
      wrap(MarkdownEditorState.prototype, 'replaceRange')
    ];
    return {
      parts,
      stop: () => restore.forEach((undo) => undo())
    };
  };

  /**
   * Every geometry read, timed inside it and reported under the API's name, with the top frame of
   * the caller for the reads that cost something. A read is where a pending layout is paid for, so
   * the one that follows the block's swap is the layout — and it is worth knowing whose it is.
   */
  const reads = () => {
    const found = {};
    const undo = [];
    const record = (name, ms, caller) => {
      const entry = (found[name] ??= { calls: 0, ms: 0, slowest: 0, caller: null });
      entry.calls += 1;
      entry.ms += ms;
      if (ms > entry.slowest) {
        entry.slowest = ms;
        entry.caller = caller;
      }
    };
    const callerOf = (ms) => {
      if (ms < 1) {
        return null;
      }
      const line = (new Error().stack ?? '').split('\n')[2] ?? '';
      return line.trim().replace(/^at\s+/, '').slice(0, 120);
    };
    /** Wraps one API — a method, or a get/set pair — and times each call inside it. */
    const api = (owner, name, label) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      if (!descriptor) {
        return;
      }
      const timing = (call) =>
        function (...args) {
          const started = performance.now();
          try {
            return call(this, args);
          } finally {
            const ms = performance.now() - started;
            record(label, ms, callerOf(ms));
          }
        };
      const wrapped = { ...descriptor, configurable: true };
      if (typeof descriptor.value === 'function') {
        wrapped.value = timing((self, args) => descriptor.value.apply(self, args));
      }
      if (descriptor.get) {
        wrapped.get = timing((self) => descriptor.get.call(self));
      }
      if (descriptor.set) {
        wrapped.set = timing((self, args) => descriptor.set.call(self, args[0]));
      }
      Object.defineProperty(owner, name, wrapped);
      undo.push(() => Object.defineProperty(owner, name, descriptor));
    };

    api(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect');
    api(Element.prototype, 'getClientRects', 'getClientRects');
    api(Element.prototype, 'scrollTop', 'scrollTop');
    api(Element.prototype, 'scrollHeight', 'scrollHeight');
    api(Element.prototype, 'clientHeight', 'clientHeight');
    api(Element.prototype, 'clientWidth', 'clientWidth');
    api(HTMLElement.prototype, 'offsetHeight', 'offsetHeight');
    api(HTMLElement.prototype, 'offsetTop', 'offsetTop');
    api(HTMLElement.prototype, 'offsetWidth', 'offsetWidth');
    // And the DOM calls a caret and a focus are made of — the parts of the path whose own code the
    // app keeps private (`restoreCaret`, `followCaret`, `regainKeyboard`), which is the rest of a
    // keystroke once the parse and the renderer are accounted for.
    api(Selection.prototype, 'collapse', 'Selection.collapse');
    api(Selection.prototype, 'setBaseAndExtent', 'Selection.setBaseAndExtent');
    api(Selection.prototype, 'addRange', 'Selection.addRange');
    api(Range.prototype, 'setStart', 'Range.setStart');
    api(Range.prototype, 'setEnd', 'Range.setEnd');
    api(HTMLElement.prototype, 'focus', 'focus');
    api(HTMLElement.prototype, 'blur', 'blur');
    api(HTMLElement.prototype, 'scrollIntoView', 'scrollIntoView');
    return {
      found,
      stop: () => undo.forEach((undo) => undo())
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

    // A warm keystroke first, because these paths are small and a cold one is the measurement several
    // times over — measured: the same keystroke was 57 ms on its first round and 32 on its second.
    // The rounds after it are what is reported, as medians: one keystroke's milliseconds are mostly
    // the machine's mood.
    t.key('x');
    await t.sleep(200);
    const before = t.scroller().scrollHeight;
    const rounds = [];
    for (let round = 0; round < 9; round += 1) {
      const watched = timed();
      const read = reads();
      const started = performance.now();
      t.key('x');
      const keystrokeMs = Math.round((performance.now() - started) * 10) / 10;
      const found = Object.fromEntries(
        Object.entries(watched.parts).map(([name, part]) => [
          name,
          {
            calls: part.calls,
            ms: Math.round(part.ms * 10) / 10,
            inclusive: Math.round(part.inclusive * 10) / 10
          }
        ])
      );
      const foundReads = Object.fromEntries(
        Object.entries(read.found).map(([name, entry]) => [
          name,
          {
            calls: entry.calls,
            ms: Math.round(entry.ms * 10) / 10,
            slowest: Math.round(entry.slowest * 10) / 10,
            caller: entry.caller
          }
        ])
      );
      read.stop();
      watched.stop();
      rounds.push({ keystrokeMs, parts: found, reads: foundReads });
      await t.sleep(120);
    }
    const atMedian = (numbers) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)] ?? 0;
    const parts = {};
    for (const name of new Set(rounds.flatMap((round) => Object.keys(round.parts)))) {
      const each = rounds.map((round) => round.parts[name] ?? { calls: 0, ms: 0 });
      parts[name] = {
        calls: atMedian(each.map((part) => part.calls)),
        ms: atMedian(each.map((part) => part.ms)),
        inclusive: atMedian(each.map((part) => part.inclusive ?? 0))
      };
    }
    // The reads, by API: how often the median round makes one, how long it spends inside it, and the
    // slowest one's caller across every round — a read is where a pending layout is paid for, so the
    // caller is the answer to "whose layout is it".
    const geometries = {};
    let slowest = 0;
    let slowestCaller = null;
    for (const round of rounds) {
      for (const [name, entry] of Object.entries(round.reads)) {
        const into = (geometries[name] ??= { ms: [], calls: [], slowest: 0, caller: null });
        into.ms.push(entry.ms);
        into.calls.push(entry.calls);
        if (entry.slowest > into.slowest) {
          into.slowest = entry.slowest;
          into.caller = entry.caller;
        }
        if (entry.slowest > slowest) {
          slowest = entry.slowest;
          slowestCaller = entry.caller;
        }
      }
    }
    const readReport = Object.fromEntries(
      Object.entries(geometries).map(([name, entry]) => [
        name,
        { calls: atMedian(entry.calls), ms: atMedian(entry.ms), slowestMs: entry.slowest, caller: entry.caller }
      ])
    );
    /**
     * The seams the path calls that no prototype can be wrapped for — they are module functions, and
     * the editor holds its imports as bindings — timed here by calling the app's own functions with
     * the app's own state and the live page, as `block-rebuild-cost.js` times the build.
     */
    const text = await t.raw();
    const liveState = new MarkdownEditorState(text);
    const root = t.prose();
    const at = t.textNodesIn(t.blocks()[0]).find((leaf) => leaf.data.includes(entry.needle));
    const offset = liveState.getText().indexOf(entry.needle) + 2;
    const isolated = {};
    const timeIsolated = (name, fn) => {
      // A seam that is not exported is skipped rather than failing the probe: what this measures is
      // whatever the app makes reachable, and the names are the count.
      if (typeof fn !== 'function') {
        return;
      }
      const times = [];
      for (let round = 0; round < 9; round += 1) {
        const started = performance.now();
        fn();
        times.push(performance.now() - started);
      }
      isolated[name] = Math.round(atMedian(times) * 10) / 10;
    };
    timeIsolated('domPositionAtOffset', () => domPositionAtOffset?.(liveState, root, offset));
    timeIsolated('plainRun', () => plainRun?.(liveState, root, offset, offset));
    timeIsolated('sourceRangeAt', () => sourceRangeAt?.(liveState, offset, false));
    const domElements = t.blocks()[0]?.querySelectorAll('*').length ?? 0;
    results.push({
      label: entry.label,
      keystrokeMs: atMedian(rounds.map((round) => round.keystrokeMs)),
      detachedMs,
      parts,
      accountedMs: Math.round(Object.values(parts).reduce((sum, part) => sum + part.ms, 0) * 10) / 10,
      readsMs: atMedian(rounds.map((round) => Object.values(round.reads).reduce((sum, entry) => sum + entry.ms, 0))),
      reads: readReport,
      slowestReadMs: slowest,
      slowestReadCaller: slowestCaller,
      isolated,
      domElements,
      scrollHeightChange: t.scroller().scrollHeight - before
    });
  }
  return { results };
})()
