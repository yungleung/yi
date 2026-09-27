/**
 * The editor is a page of A4 held in the pane.
 *
 * The column was 254 mm wide and 151 characters a line; the ask is a printed A4 — 210 mm of
 * paper, a 25 mm margin all round, the page centred on a desk. This measures that, in both
 * themes: the sheet's size, the margin as the padding it is, the centre it sits at, and that
 * the paper is the theme's `base-100` on a `base-200` desk. The last check is the point of
 * the exercise — the measure a reader gets — held in a range, so a column that drifts back
 * towards the window's width fails rather than merely looking wrong.
 *
 * A pane too narrow to hold the sheet gets a *smaller page* rather than a sideways scroll:
 * the paper, its margin, its type and its whole vertical rhythm all take one scale
 * (`markdown_editor.ts: fitPage`, the `--page-scale` the page is drawn with). So the page is
 * A4 while A4 fits, always fits the pane it is in, and its lines keep their spacing relative
 * to the words rather than to the window.
 *
 * @covers src/styles.css, src/ui/markdown/virtual_block_renderer.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const MM = 96 / 25.4;
  const A4_WIDTH_PX = Math.round(210 * MM);
  const A4_HEIGHT_PX = Math.round(297 * MM);
  const MARGIN_PX = 25 * MM;

  const document_ = [
    '---',
    'title: A short note',
    '---',
    '',
    '# A heading',
    '',
    'The quick brown fox jumps over the lazy dog, and then it does it again so the line is long enough to measure how many characters a reader actually gets per line.',
    '',
    '> A quote, for the space around a block.',
    '',
    '| one | two |',
    '| --- | --- |',
    '| a | b |',
    '',
    'A sentence with a note.[^1]',
    '',
    '[^1]: The note itself.',
    '',
    '```ts',
    'const a = 1;',
    '```',
    ''
  ].join('\n');
  await t.load(document_);

  const root = document.documentElement;
  const sheet = () => t.prose();
  const desk = () => document.querySelector('.markdown-scroller');
  const rect = (element) => element.getBoundingClientRect();
  const mm = (value) => Math.round((value / MM) * 10) / 10;
  /**
   * Holds the pane at a width of its own, so what this measures is the page rather than
   * whatever size the window happens to be. The page fits the pane it is given.
   */
  const setPane = async (width) => {
    const scroller = desk();
    scroller.style.flex = 'none';
    scroller.style.width = `${width}px`;
    await t.sleep(250);
  };
  const releasePane = async () => {
    desk().style.flex = '';
    desk().style.width = '';
    await t.sleep(200);
  };
  /**
   * What a background declaration actually computes to. A theme token and the surface that
   * uses it are the same colour written two ways (`oklch(100% 0 0)` and `oklch(1 0 0)`), so
   * the token is put through the engine before the two are compared.
   */
  const resolveColour = (value) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = value;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  };

  const page = () => {
    const element = sheet();
    const style = getComputedStyle(element);
    return {
      width: Math.round(rect(element).width),
      widthMm: mm(rect(element).width),
      height: Math.round(rect(element).height),
      heightMm: mm(rect(element).height),
      padding: style.padding,
      paddingPx: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
        (value) => Math.round(parseFloat(value))
      ),
      background: style.backgroundColor,
      border: style.borderTopWidth
    };
  };

  /** The page's rhythm: the line box, and the steps between its blocks. */
  const rhythm = () => {
    const root = sheet();
    const paragraph = getComputedStyle(root.querySelector('p'));
    const note = root.querySelector('.markdown-footnote');
    return {
      lineHeight: parseFloat(paragraph.lineHeight),
      paragraphGap: parseFloat(paragraph.marginBottom),
      headingGap: parseFloat(getComputedStyle(root.querySelector('h1')).marginBottom),
      blockGap: parseFloat(getComputedStyle(root.querySelector('blockquote')).marginTop),
      cellPadding: parseFloat(getComputedStyle(root.querySelector('.markdown-table th')).paddingTop),
      noteType: note === null ? null : parseFloat(getComputedStyle(note).fontSize)
    };
  };

  const themeFacts = {};
  try {
    await setPane(1000);
    for (const theme of ['winter', 'dim']) {
      root.setAttribute('data-theme', theme);
      await t.sleep(60);
      const style = getComputedStyle(root);
      themeFacts[theme] = {
        page: page(),
        rhythm: rhythm(),
        deskBackground: getComputedStyle(desk()).backgroundColor,
        base100: resolveColour('var(--color-base-100)'),
        base200: resolveColour('var(--color-base-200)')
      };
    }
  } finally {
    root.removeAttribute('data-theme');
    await t.sleep(80);
  }

  const winter = themeFacts.winter;
  const dim = themeFacts.dim;
  check(
    'the page is 210 mm of A4',
    Math.abs(winter.page.width - A4_WIDTH_PX) <= 2,
    { width: winter.page.width, expected: A4_WIDTH_PX }
  );
  check(
    'and at least 297 mm tall for a note that is shorter',
    winter.page.height >= A4_HEIGHT_PX - 2,
    { height: winter.page.height, expected: A4_HEIGHT_PX }
  );
  check(
    'the printed margin is the page`s own padding, all round',
    winter.page.paddingPx.every((value) => Math.abs(value - MARGIN_PX) <= 1),
    winter.page.paddingPx
  );

  // The text column: what is left of the paper once the margins and the hairline edge are
  // taken, which is where the measure below comes from.
  const border = parseFloat(winter.page.border);
  const textColumn = winter.page.width - 2 * border - 2 * winter.page.paddingPx[1];
  check(
    'and the words sit inside it, at 160 mm across',
    Math.abs(mm(textColumn) - 160) <= 1,
    { textColumn: Math.round(textColumn), textColumnMm: mm(textColumn) }
  );

  const deskStyle = getComputedStyle(desk());
  const left = Math.round(rect(sheet()).left - rect(desk()).left - parseFloat(deskStyle.paddingLeft));
  const right = Math.round(
    rect(desk()).right - parseFloat(deskStyle.paddingRight) - rect(sheet()).right
  );
  check(
    'the page is centred on the desk',
    Math.abs(left - right) <= 2,
    { left, right }
  );
  check(
    'the paper is the theme`s page and the desk is its board',
    winter.page.background !== winter.deskBackground &&
      winter.page.background === winter.base100 &&
      winter.deskBackground === winter.base200 &&
      dim.page.background === dim.base100 &&
      dim.deskBackground === dim.base200,
    {
      winter: { paper: winter.page.background, desk: winter.deskBackground, base100: winter.base100, base200: winter.base200 },
      dim: { paper: dim.page.background, desk: dim.deskBackground, base100: dim.base100, base200: dim.base200 }
    }
  );

  // The measure: a sample of the paragraph's own text, in its own style, against the width
  // the words actually get.
  const paragraph = sheet().querySelector('p');
  const paragraphStyle = getComputedStyle(paragraph);
  const sample = document.createElement('span');
  sample.style.whiteSpace = 'pre';
  sample.style.visibility = 'hidden';
  sample.style.fontFamily = paragraphStyle.fontFamily;
  sample.style.fontSize = paragraphStyle.fontSize;
  sample.style.fontWeight = paragraphStyle.fontWeight;
  sample.style.fontStyle = paragraphStyle.fontStyle;
  sample.style.letterSpacing = paragraphStyle.letterSpacing;
  sample.textContent = (paragraph.textContent ?? '').slice(0, 100);
  document.body.appendChild(sample);
  const perCharacter = rect(sample).width / 100;
  sample.remove();
  const measure = Math.round(textColumn / perCharacter);
  check(
    'and the measure is a page`s, not the window`s',
    measure >= 70 && measure <= 110,
    { charactersPerLine: measure, pixelsPerCharacter: Math.round(perCharacter * 100) / 100 }
  );

  // The layout changed, not the editing: a click in a paragraph still lands and types.
  const paragraphText = paragraph.textContent ?? '';
  const text = t.textNodesIn(sheet().querySelector('p'))[0];
  const range = document.createRange();
  range.setStart(text, 4);
  range.collapse(true);
  const caretRect = range.getBoundingClientRect();
  text.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: caretRect.left + 1, clientY: caretRect.top + 2 })
  );
  await t.sleep(200);
  t.key('X');
  await t.sleep(250);
  const typedInto =
    paragraphText.slice(0, 4) + 'X' + paragraphText.slice(4);
  const typed = await t.raw();
  check(
    'and a click still types where it landed',
    typed === document_.replace(paragraphText, typedInto),
    typed.slice(0, 60)
  );

  // 2. A pane too narrow for the sheet: the page shrinks to fit, and so do its margin and
  // its type — nothing scrolls sideways.
  await setPane(600);
  const scroller = desk();
  const narrow = page();
  const narrowRhythm = rhythm();
  const narrowFont = parseFloat(getComputedStyle(sheet()).fontSize);
  const available = 600 - 2 * parseFloat(getComputedStyle(scroller).paddingLeft);
  const scale = narrow.width / A4_WIDTH_PX;
  check(
    'a pane too narrow for the sheet scales the page instead of scrolling it',
    narrow.width <= available + 1 && scroller.scrollWidth <= scroller.clientWidth + 1,
    {
      width: narrow.width,
      available: Math.round(available),
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth
    }
  );
  check(
    'and the paper keeps its shape: the margin is the same fraction of it',
    Math.abs(narrow.paddingPx[0] / narrow.width - 25 / 210) <= 0.002,
    {
      padding: narrow.paddingPx[0],
      width: narrow.width,
      ratio: Number((narrow.paddingPx[0] / narrow.width).toFixed(4)),
      expected: Number((25 / 210).toFixed(4))
    }
  );
  check(
    'and the words take that scale too',
    Math.abs(narrowFont - 16 * scale) <= 0.3,
    {
      fontSize: narrowFont,
      expected: Math.round(16 * scale * 100) / 100,
      scale: Math.round(scale * 1000) / 1000
    }
  );
  // The rhythm is the page's, not the window's: every step of it comes down with the type.
  const wideRhythm = themeFacts.winter.rhythm;
  const steps = Object.keys(wideRhythm);
  const unscaled = steps.filter(
    (step) =>
      wideRhythm[step] !== null &&
      Math.abs(narrowRhythm[step] - wideRhythm[step] * scale) > 0.6
  );
  check(
    'and the page`s whole rhythm comes down with it',
    scale < 0.9 && unscaled.length === 0,
    {
      scale: Math.round(scale * 1000) / 1000,
      unscaled: unscaled.map((step) => ({
        step,
        atFullSize: wideRhythm[step],
        now: narrowRhythm[step],
        expected: Math.round(wideRhythm[step] * scale * 100) / 100
      }))
    }
  );
  await releasePane();

  return {
    page: winter.page,
    desk: { background: winter.deskBackground, padding: deskStyle.padding },
    measure,
    rhythm: { atFullSize: wideRhythm, narrow: narrowRhythm },
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()
