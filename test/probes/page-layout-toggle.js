/**
 * The layout button: a page of A4, or the column at the width of the pane.
 *
 * The button sits at the right of the *status* bar (the bar under the document, with the word
 * count) and draws the layout the editor is in — a sheet while it is a page, a frame while the
 * words take the whole width — and pressing it runs `view:togglePage`. This drives the real
 * button and measures both layouts: what the page is (210 mm of sheet, a 25 mm margin, a desk
 * under it), what the column is (the pane's width inside its outer and marker-gutter margins, no
 * sheet and no desk, and the 16px type at 24px a line it always had), that the button's icon, name
 * and `aria-pressed` say which is on, that the bar it sits in is not much taller than it was for
 * it, and that a click still types where it landed after the switch.
 *
 * `a4-page.js` holds the page's own geometry and the way it scales to a narrow pane; this
 * holds the switch between the two layouts.
 *
 * A document's layout is remembered in the app config, so this probe leaves the editor on a
 * page — the default — and the suite's other probes see what they always have.
 *
 * @covers src/ui/toolbar/index.ts, src/ui/markdown/markdown_editor.ts,
 *   src/styles.css
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');

  const MM = 96 / 25.4;
  const A4_WIDTH_PX = Math.round(210 * MM);
  const document_ = [
    '---',
    'title: A short note',
    '---',
    '',
    '# A heading',
    '',
    'The quick brown fox jumps over the lazy dog, and then it does it again so the line is long enough to measure.',
    '',
    'tail',
    ''
  ].join('\n');
  await t.load(document_);
  // Start from a page whatever the app was left in — the layout is remembered in the app
  // config — so the checks below measure the switch rather than the state they found.
  await t.useLayout('page');

  const scroller = () => document.querySelector('.markdown-scroller');
  const sheet = () => t.prose();
  const AUTO_PADDING_LEFT = 40;
  const AUTO_PADDING_RIGHT = 16;
  const layoutButton = () =>
    [...document.querySelectorAll('button')].find((button) =>
      ['A4 page', 'Full width'].includes(button.getAttribute('aria-label') ?? '')
    );
  /** Holds the pane at a width of its own, so the measurements are the layout's. */
  const setPane = async (width) => {
    scroller().style.flex = 'none';
    scroller().style.width = `${width}px`;
    await t.sleep(400);
  };
  const releasePane = async () => {
    scroller().style.flex = '';
    scroller().style.width = '';
    await t.sleep(200);
  };

  /** What the editor looks like right now, and what the button says about it. */
  const look = () => {
    const element = sheet();
    const style = getComputedStyle(element);
    const desk = getComputedStyle(scroller());
    const button = layoutButton();
    const svg = button?.querySelector('svg');
    return {
      layout: scroller().dataset.layout,
      width: Math.round(element.getBoundingClientRect().width),
      padding: style.padding,
      background: style.backgroundColor,
      border: style.borderTopWidth,
      fontSize: parseFloat(style.fontSize),
      lineHeight: parseFloat(style.lineHeight),
      deskPadding: desk.padding,
      scale: getComputedStyle(scroller()).getPropertyValue('--page-scale'),
      label: button?.getAttribute('aria-label') ?? null,
      pressed: button?.getAttribute('aria-pressed') ?? null,
      icon: svg?.querySelector('path[fill="currentColor"]')?.getAttribute('d') ?? null,
      viewBox: svg?.getAttribute('viewBox') ?? null,
      inTitleBar: button?.closest('.titlebar') !== null,
      barHeight: button
        ? Math.round(button.parentElement.parentElement.getBoundingClientRect().height)
        : null
    };
  };
  const press = async () => {
    layoutButton()?.click();
    await t.sleep(300);
  };

  await setPane(1000);
  const page = look();
  check(
    'the button sits in the status bar, not the titlebar',
    page.inTitleBar === false && page.barHeight !== null && page.barHeight <= 24,
    { inTitleBar: page.inTitleBar, barHeight: page.barHeight }
  );
  check(
    'and at the right of it it draws the page while the editor is one',
    page.icon !== null &&
      page.icon.startsWith('M24.75 2A3.25') &&
      page.viewBox === '0 0 32 32' &&
      page.label === 'Full width' &&
      page.pressed === 'true',
    { icon: page.icon?.slice(0, 24) ?? null, viewBox: page.viewBox, label: page.label, pressed: page.pressed }
  );
  check(
    'and the editor is a page of A4',
    page.layout === 'page' && Math.abs(page.width - A4_WIDTH_PX) <= 2 && page.padding.startsWith('94'),
    { layout: page.layout, width: page.width, padding: page.padding }
  );

  // A press takes the sheet away: the column fills the pane inside its margins, there is no desk,
  // and every measurement is the document's own again.
  await press();
  const auto = look();
  check(
    'a press leaves the column in the pane margins, with no sheet and no desk',
    auto.layout === 'auto' &&
      auto.width === 1000 - AUTO_PADDING_LEFT - AUTO_PADDING_RIGHT &&
      auto.padding === '0px' &&
      auto.border === '0px' &&
      auto.deskPadding ===
        `${AUTO_PADDING_RIGHT}px ${AUTO_PADDING_RIGHT}px ${AUTO_PADDING_RIGHT}px ${AUTO_PADDING_LEFT}px`,
    {
      layout: auto.layout,
      width: auto.width,
      expected: 1000 - AUTO_PADDING_LEFT - AUTO_PADDING_RIGHT,
      padding: auto.padding,
      border: auto.border,
      deskPadding: auto.deskPadding
    }
  );
  check(
    'and the type and its line are the 16px over 24px the column always had',
    auto.fontSize === 16 && auto.lineHeight === 24 && auto.scale === '1',
    { fontSize: auto.fontSize, lineHeight: auto.lineHeight, scale: auto.scale }
  );
  check(
    'and the button draws the full-width icon and names the page',
    auto.icon !== null &&
      auto.icon.startsWith('M18.25 4A3.75') &&
      auto.viewBox === '0 0 24 24' &&
      auto.label === 'A4 page' &&
      auto.pressed === 'false',
    { icon: auto.icon?.slice(0, 24) ?? null, viewBox: auto.viewBox, label: auto.label, pressed: auto.pressed }
  );

  // The layout is a view of the document, not a change to it: a click still lands and types.
  document.querySelector('.markdown-composition-input')?.focus();
  await t.sleep(80);
  const paragraphText = sheet().querySelector('p').textContent ?? '';
  const text = t.textNodesIn(sheet().querySelector('p'))[0];
  const range = document.createRange();
  range.setStart(text, 4);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  const clickAt = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 1,
    clientY: rect.top + 2
  };
  text.parentElement.dispatchEvent(new PointerEvent('pointerdown', clickAt));
  text.parentElement.dispatchEvent(new PointerEvent('pointerup', clickAt));
  text.parentElement.dispatchEvent(new MouseEvent('click', clickAt));
  await t.sleep(200);
  const placed = caretModule.getCaretRange();
  t.key('X');
  await t.sleep(300);
  check(
    'and a click in the full-width column still types where it landed',
    placed !== null &&
      (await t.raw()) ===
        document_.replace(paragraphText, `${paragraphText.slice(0, 4)}X${paragraphText.slice(4)}`),
    (await t.raw()).slice(0, 60)
  );

  // Back to the page, which is where this leaves the editor.
  await press();
  const back = look();
  check(
    'and a second press brings the page back',
    back.layout === 'page' && Math.abs(back.width - A4_WIDTH_PX) <= 2 && back.pressed === 'true',
    { layout: back.layout, width: back.width, pressed: back.pressed }
  );
  await releasePane();

  return {
    page,
    auto,
    back,
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
