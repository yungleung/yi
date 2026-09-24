/**
 * What an edit costs the document itself: the state's own work — the store, the
 * split, the blocks — typed at the top of a long note and at its end, with no DOM in
 * the way.
 *
 * A keystroke near the top used to rewrite every block below it, because their four
 * positions were absolute numbers on the blocks; now their positions are derived from
 * an index, so the blocks the edit did not reach are the objects they were. The text
 * as a string is measured too, because P6 recorded it as the other half of the cost
 * and it turns out to be free (V8 hands back a sliced string).
 *
 * @covers src/ui/markdown/document/block_index.ts, src/ui/markdown/document/blocks.ts
 * @needs-large-document — run against the 323 KB fixture note.
 */
(async () => {
  const t = window.__t;
  const { MarkdownEditorState } = await t.app('/src/ui/markdown/document/state.ts');
  const { TextStore } = await t.app('/src/ui/markdown/document/text_store.ts');
  const out = t.report({});
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 100) / 100;

  const text = await t.raw();
  out.document = { characters: text.length };

  // The text as one string, once per version: what every caller above the store asks
  // for, and what the split is handed.
  const materialise = [];
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    new TextStore(text).toString();
    materialise.push(performance.now() - started);
  }
  out.materialiseMs = round(median(materialise));

  /** Types `count` characters at `where`, one at a time, and reports what it cost. */
  const typedAt = (where, count, document_ = text) => {
    const state = new MarkdownEditorState(document_);
    const before = state.getBlocks();
    const edits = [];
    for (let index = 0; index < count; index += 1) {
      const started = performance.now();
      state.replaceRange(where + index, where + index, 'x');
      edits.push(performance.now() - started);
    }
    const after = state.getBlocks();
    return {
      ms: round(median(edits)),
      blocks: after.length,
      // The blocks the edit did not reach are the objects they were; only the ones it
      // rebuilt are new.
      rewritten: after.filter((block, index) => block !== before[index]).length,
      sameText: after.filter((block, index) => block.text === before[index]?.text).length
    };
  };
  out.atTheTop = typedAt(1, 30);
  out.atTheEnd = typedAt(text.length - 1, 30);
  // The shape of the fix, at four times the note: the blocks the edit does not reach
  // are the objects they were whatever the document's size, where rewriting them grew
  // with the number of blocks below the edit.
  const longer = text.repeat(4);
  out.inAFourTimesLongerNote = {
    characters: longer.length,
    ...typedAt(1, 10, longer)
  };
  return out;
})()
