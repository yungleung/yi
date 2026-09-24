/**
 * The card a footnote marker shows when the pointer rests on it.
 *
 * Four things: it appears with the definition's text after the dwell, and that text
 * is *rendered* (the note's italic and its link are elements, not asterisks and
 * brackets); it does not appear for a label the document does not define, not even
 * empty; it stays while the pointer is inside it, so a note can be read and selected;
 * and it leaves once the pointer is outside both it and its marker. Its position is
 * checked against the marker's rect, because a card pointing at the wrong marker is
 * worse than none.
 *
 * Reading a note must not touch the document, so the link in it is opened by the app
 * rather than by the webview: the probe stands in for the backend for that one
 * command (`watchOpener`) and checks what the app asked it for.
 *
 * @covers src/ui/markdown/footnote_preview.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const card = () => document.querySelector('.markdown-footnote-preview');
  /**
   * Stands in for the backend for one command, so a note's link can be followed
   * without a browser opening: the app's `invoke` posts every command through the
   * page's `fetch` (the IPC surface itself, `window.__TAURI_INTERNALS__.invoke`, is
   * defined non-writable, so this is the outer edge a probe can reach), and what it
   * posts is recorded here and answered instead of being delivered.
   */
  const watchOpener = () => {
    const calls = [];
    const real = window.fetch;
    window.fetch = async (input, init) => {
      // The command travels as the request's path, percent-encoded:
      // `ipc://localhost/plugin%3Aopener%7Copen_url`.
      const url = decodeURIComponent(
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      );
      if (!url.includes('plugin:opener')) {
        return await real.call(window, input, init);
      }
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : String(init?.body) });
      return new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json', 'Tauri-Response': 'ok' }
      });
    };
    return {
      calls,
      stop: () => {
        window.fetch = real;
      }
    };
  };
  /** Rests the pointer on an element for longer than the dwell. */
  const hover = async (element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
    await t.sleep(500);
  };

  await t.load(
    'Body text[^1] here, and more[^2].\n\n' +
      '[^1]: A *note* with a [link](https://example.com).\n\n' +
      '[^2]: The second note.\n'
  );
  const markers = [...t.prose().querySelectorAll('[data-footnote-ref]')];
  check('the document has both markers', markers.length === 2, markers.length);
  check('and nothing is showing yet', card() === null, Boolean(card()));

  await hover(markers[0]);
  const shown = card();
  check('resting on a marker shows its note', shown !== null, Boolean(shown));
  check(
    'and the note is the one it names, rendered',
    shown !== null &&
      shown.textContent.includes('A note with a link.') &&
      shown.textContent.includes('[^1]') &&
      shown.querySelector('em, i') !== null &&
      shown.querySelector('a') !== null,
    shown ? shown.textContent : null
  );
  check(
    'and the card says which note it is showing, as the notes run does',
    shown !== null && shown.querySelector('[data-footnote-def]')?.textContent === '[^1]',
    shown ? shown.querySelector('[data-footnote-def]')?.textContent ?? null : null
  );
  // The two floating surfaces should not disagree about their corners: open the find bar and
  // compare what the browser says each is rounded by.
  const { runCommand } = await t.app('/src/ui/markdown/commands/registry.ts');
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'find' });
  await t.sleep(250);
  const bar = document.querySelector('[data-find-bar]');
  const barRadius = bar ? getComputedStyle(bar).borderRadius : null;
  runCommand('find:close');
  await t.sleep(150);
  check(
    'and its corners are the find bar`s',
    shown !== null && barRadius !== null && getComputedStyle(shown).borderRadius === barRadius,
    { card: shown ? getComputedStyle(shown).borderRadius : null, bar: barRadius }
  );
  check(
    'the card points at the marker it came from',
    (() => {
      if (!shown) {
        return false;
      }
      const marker = markers[0].getBoundingClientRect();
      const box = shown.getBoundingClientRect();
      return (
        box.top >= marker.top - 2 &&
        box.top <= marker.bottom + 24 &&
        box.left <= marker.right + 4 &&
        box.bottom <= window.innerHeight
      );
    })(),
    shown ? t.rectOf(shown) : null
  );
  check(
    'the card can take the pointer, so a note can be read and selected',
    shown !== null && getComputedStyle(shown).pointerEvents === 'auto',
    shown ? getComputedStyle(shown).pointerEvents : null
  );
  check(
    'the card is outside the text, so nothing reflows',
    shown !== null && !t.prose().contains(shown),
    shown !== null ? shown.parentElement?.tagName ?? null : null
  );

  t.prose().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  // The card waits a grace so the pointer can cross the gap to it.
  await t.sleep(600);
  check('leaving the marker takes the card away', card() === null, Boolean(card()));

  await hover(markers[1]);
  check(
    'each marker shows its own note',
    card()?.textContent.includes('The second note.') === true &&
      card()?.querySelector('[data-footnote-def]')?.textContent === '[^2]',
    card() ? card().textContent : null
  );

  // The card is a place to read: hovering it keeps it, and a link in a note is
  // followed through the app rather than by navigating the webview.
  await hover(markers[0]);
  const open = card();
  check('the first marker is showing again', open !== null, Boolean(open));
  if (open) {
    open.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await t.sleep(600);
    check('resting on the card keeps it', card() === open, Boolean(card()));
    const link = open.querySelector('a[href]');
    check('the note has a link to follow', link !== null, link ? link.getAttribute('href') : null);
    const opener = watchOpener();
    const clicked = new MouseEvent('click', { bubbles: true, cancelable: true });
    try {
      link?.dispatchEvent(clicked);
      await t.sleep(200);
    } finally {
      opener.stop();
    }
    check('following the link does not navigate the page', clicked.defaultPrevented, clicked.defaultPrevented);
    check(
      'and asks the app to open it',
      opener.calls.some((entry) => entry.url.includes('open_url') && entry.body.includes('example.com')),
      opener.calls
    );
    check('the document is untouched by reading a note', (await t.raw()).endsWith('[^2]: The second note.\n'), true);
  }

  // And the marker being edited is left alone: a card in the way of the label the
  // author is typing would be noise.
  await t.load('Body text[^1] here.\n\n[^1]: A note.\n');
  const marker = t.prose().querySelector('[data-footnote-ref]');
  const box = marker.getBoundingClientRect();
  marker.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2
    })
  );
  await t.sleep(300);
  const editing = t.prose().querySelector('[data-footnote-ref].markdown-footnote-source');
  if (editing) {
    await hover(editing);
  }
  check(
    'a marker being edited shows no card',
    editing !== null && card() === null,
    { editing: Boolean(editing), card: card() ? card().textContent : null }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()
