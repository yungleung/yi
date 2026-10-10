/**
 * Hovering a citation shows what its keys are: the reference entries the bibliography lists those
 * works under, in the CSL style and bibliography file the settings name.
 *
 * Five things: the card appears after the dwell and holds the *reference* (`Smith, J. (2020). Code
 * Review Practices…`) rather than the in-text form the sentence already shows; a cluster shows one
 * paragraph per work; a key the library does not hold shows no card at all; the card stays while
 * the pointer is on it, so a reference can be read and copied, and leaves once the pointer is
 * outside both it and its citation; and a citation showing its own source — the author editing it —
 * shows nothing, because a card over the text being typed would be noise. Its position is checked
 * against the citation's rect, because a card pointing at the wrong citation is worse than none,
 * and its corner against the find bar's, because the app's reading surfaces should not disagree
 * about what they look like. Reading a reference must not touch the document, so the last check is
 * the text itself.
 *
 * @covers src/ui/markdown/citation_preview.ts, src/services/bibliography.ts,
 *   src/services/citation_reference.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const verdict = () =>
    t.report({ checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) });
  const card = () => document.querySelector('.markdown-citation-preview');
  /** Whether the card's text can be selected: this WebKit exposes only the prefixed property. */
  const selectOf = (element) => {
    const style = getComputedStyle(element);
    return style.userSelect || style.webkitUserSelect;
  };
  /** Rests the pointer on an element for longer than the dwell. */
  const hover = async (element, ms = 250) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
    await t.sleep(ms);
  };
  /** Takes the pointer off the whole text, as moving it out of the pane does. */
  const leave = async () => {
    t.prose().dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
    );
    await t.sleep(300);
  };

  const measure = async () => {
    await t.load(
      'Known [@smith2020]. Two works [see @smith2020; also @jones2019], with a locator ' +
        '[@smith2020, p. 45]. Missing [@nosuchkey].\n'
    );
    // The bibliography is read from disk, so the formatted text arrives a moment after the block.
    let citations = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await t.sleep(70);
      citations = [...t.prose().querySelectorAll('[data-citation]')];
      if (citations.length === 4 && /Smith/.test(citations[0].textContent)) {
        break;
      }
    }
    check('the document has all four citations', citations.length === 4, citations.length);
    check('and nothing is showing yet', card() === null, Boolean(card()));

    await hover(citations[0]);
    const shown = card();
    check('resting on a citation shows a card', shown !== null, Boolean(shown));
    check(
      'and the card is the work’s reference, not the in-text form the sentence shows',
      shown !== null &&
        shown.textContent.includes('Code Review Practices in Large-Scale Software Development') &&
        shown.textContent.includes('IEEE Software') &&
        !shown.textContent.includes('@smith2020'),
      shown ? shown.textContent : null
    );
    // The two floating surfaces should not disagree about their corners: open the find bar and
    // compare what the browser says each is rounded by.
    const { runCommand } = await t.app('/src/ui/markdown/commands/registry.ts');
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'find' });
    await t.sleep(180);
    const bar = document.querySelector('[data-find-bar]');
    const barRadius = bar ? getComputedStyle(bar).borderRadius : null;
    runCommand('find:close');
    await t.sleep(120);
    check(
      'and its corners are the find bar`s',
      shown !== null && barRadius !== null && getComputedStyle(shown).borderRadius === barRadius,
      { card: shown ? getComputedStyle(shown).borderRadius : null, bar: barRadius }
    );
    check(
      'the card points at the citation it came from',
      (() => {
        if (!shown) {
          return false;
        }
        const citation = citations[0].getBoundingClientRect();
        const box = shown.getBoundingClientRect();
        return (
          box.top >= citation.top - 2 &&
          box.top <= citation.bottom + 24 &&
          box.left <= citation.right + 4 &&
          box.bottom <= window.innerHeight
        );
      })(),
      shown ? t.rectOf(shown) : null
    );
    check(
      'the card can take the pointer, so a reference can be read and copied',
      shown !== null &&
        getComputedStyle(shown).pointerEvents === 'auto' &&
        selectOf(shown) === 'text',
      shown
        ? {
            pointer: getComputedStyle(shown).pointerEvents,
            select: selectOf(shown)
          }
        : null
    );
    check(
      'the card is outside the text, so nothing reflows',
      shown !== null && !t.prose().contains(shown),
      shown !== null ? shown.parentElement?.tagName ?? null : null
    );
    verdict();

    if (shown) {
      shown.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      await t.sleep(300);
      check('resting on the card keeps it', card() === shown, Boolean(card()));
    }
    await leave();
    check('leaving the citation takes the card away', card() === null, Boolean(card()));
    verdict();

    await hover(citations[1]);
    const cluster = card();
    check(
      'a cluster shows one paragraph per work it cites',
      cluster !== null &&
        cluster.querySelectorAll('p').length === 2 &&
        cluster.textContent.includes('Smith') &&
        cluster.textContent.includes('Jones'),
      cluster ? [...cluster.querySelectorAll('p')].map((entry) => entry.textContent) : null
    );

    // Resting on the next citation replaces the card: a citation with nothing to show leaves none
    // behind, which is the same silence a marker with no definition gets.
    await hover(citations[3]);
    check(
      'a key the bibliography does not hold shows no card at all',
      card() === null,
      card() ? card().textContent : null
    );
    verdict();

    // A citation being edited is the author's text: a card over it would be noise. Entering source
    // mode re-renders the block, so the citation is a source span with no `data-citation` on it.
    await t.click(citations[0]);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await t.sleep(70);
      if (t.prose().querySelector('[data-citation]') === null) {
        break;
      }
    }
    const source = t.prose().querySelector('.markdown-citation-source');
    if (source) {
      await hover(source);
    }
    check(
      'a citation showing its own source shows no card',
      source !== null && card() === null,
      { editing: Boolean(source), card: card() ? card().textContent : null }
    );
    check(
      'and the document is untouched by reading a reference',
      (await t.raw()).includes('see @smith2020; also @jones2019'),
      true
    );

    return verdict();
  };

  // The app a probe drives is the maintainer's, and it holds their session — the documents they
  // had open. This probe loads test documents into the editor, so it puts the session text back
  // the way it found it (the harness already does this half for the config: `--with-workspace`).
  const { loadSessionText, saveSessionText } = await t.app('/src/api/session.ts');
  const session = await loadSessionText();
  try {
    return await measure();
  } finally {
    if (session !== null) {
      await saveSessionText(session);
    }
  }
})()
