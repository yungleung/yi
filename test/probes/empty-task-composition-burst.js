/**
 * A composed word followed immediately by more typing stays in an empty task row.
 *
 * The empty row has only a zero-width placeholder and no source word. Committing
 * an input-method word there is the dangerous case: an ordinary block rebuild
 * during `compositionend` blurs the input seam, and a key delivered before its
 * deferred refocus is lost. The burst must keep the task row mounted and receive
 * the separator and following word after the committed one.
 *
 * @covers test/fixtures/workspace/default-document.md,
 *   src/ui/markdown/editing/composition_input.ts,
 *   src/ui/markdown/editing/context.ts,
 *   src/ui/markdown/editing/text_commands.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  await t.load(window.__probeDoc);
  const emptyItem = () =>
    [...t.prose().querySelectorAll('li[data-task-source-from]')].at(-1) ?? null;
  const initialItem = emptyItem();
  const placeholder = initialItem?.querySelector('.markdown-list-placeholder');
  if (!initialItem || !placeholder) {
    return { checks, failed: ['the default fixture has an empty task row'] };
  }
  initialItem.scrollIntoView({ block: 'center' });
  await t.click(placeholder, 0.5, 0.5);
  await t.sleep(250);

  const item = emptyItem();
  const placeholderAfterClick = item?.querySelector('.markdown-list-placeholder');
  const text = placeholderAfterClick
    ? t.textNodesIn(placeholderAfterClick)[0] ?? null
    : null;
  if (!item || !placeholderAfterClick || !text) {
    return { checks, failed: ['the empty task row accepts a caret'] };
  }

  const seam = document.querySelector('.markdown-composition-input');
  let focusLosses = 0;
  document.addEventListener(
    'focusout',
    (event) => {
      if (event.target === seam) {
        focusLosses += 1;
      }
    },
    true
  );

  seam.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  seam.value = 'Quick';
  seam.dispatchEvent(
    new CompositionEvent('compositionupdate', {
      bubbles: true,
      data: 'Quick'
    })
  );
  seam.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      data: 'Quick',
      inputType: 'insertCompositionText',
      isComposing: true
    })
  );
  seam.dispatchEvent(
    new CompositionEvent('compositionend', { bubbles: true, data: 'Quick' })
  );

  for (const character of '  BrownFast') {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: character,
        bubbles: true,
        cancelable: true
      })
    );
  }
  await t.sleep(350);

  const raw = await t.raw();
  const line = raw.split('\n').find((candidate) => candidate.includes('Quick')) ?? null;
  const settledItem = emptyItem();
  check('the committed and following keys reach the document', line, '- [ ] Quick  BrownFast');
  check('the empty task keeps its mounted item', settledItem === item, true);
  check(
    'the placeholder keeps the text node the composition started in',
    settledItem?.querySelector('.markdown-list-placeholder')?.contains(text) ?? false,
    true
  );
  check('the input seam never loses focus during the hand-off', focusLosses, 0);
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
